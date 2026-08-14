# Production deployment and operations runbook

Stage 22 makes the accepted v1.0 application deployable, recoverable and
operationally safe on a single Linux host. It is NOT a product-feature stage;
the v1.0 feature freeze and the Stage 21 security contract remain authoritative.

## Approved topology

    Internet
      | HTTPS (public edge, host ports 80/443)
    Caddy reverse proxy        (TLS termination + HTTP->HTTPS redirect)
      | private Docker network "edge"
    Next.js standalone web     (server-only BFF)
      | private Docker network "app"
    Nest API                   (server-only API)
      | private Docker network "database"
    PostgreSQL 17              (named volume, no host port)

    Nest API
      | dedicated non-internal Docker network "egress" (API only)
    approved external providers / Telegram (only when existing features enabled)

Only Caddy publishes host ports. web, api and postgres have no host ports and
sit on internal networks, so:

    - Caddy can reach only web (not Nest, not PostgreSQL).
    - web can reach Nest but not PostgreSQL.
    - only Nest can reach PostgreSQL.
    - only Nest joins the outbound-capable egress network; PostgreSQL and Caddy
      do not join it, and the API still publishes no host port.
    - no Docker socket is mounted into any application container.

Browsers still reach Nest only through the Next BFF. Caddy may emit
X-Forwarded-* headers, but the application continues NOT to trust them for
Stage 21 security decisions (Origin/Host checks, cookies, CORS-off, limiter).

## Requirements

    - One Linux server / VM.
    - Docker Engine + Docker Compose v2 (docker compose).
    - Node.js 24 for any host-side tooling (image builds use node:24-slim).
    - An operator-controlled public domain and DNS A/AAAA record for Caddy TLS.

No Kubernetes, Redis, cloud-vendor services, CI/CD platform or monitoring stack
is used in this stage. Stage 23 handles observability.

## Files

    compose.production.yaml     canonical production Compose definition
    compose.acceptance.yaml     loopback-only plain-HTTP acceptance override
    apps/api/Dockerfile         API runtime + migrate targets
    apps/web/Dockerfile         web (Next standalone) runtime
    caddy/Caddyfile.production  production reverse proxy config
    caddy/Caddyfile.acceptance  isolated acceptance proxy config
    ops/backup.sh               daily/weekly logical backup
    ops/backup-host.sh          canonical crash-safe host backup wrapper
    ops/restore.sh              safe explicit restore
    ops/backup-verify.sh        checksum verification
    ops/validate-env.sh         Stage 22 deployment-field consistency check
    ops/systemd/                daily/weekly backup timer examples
    .env.production.example     sanitized deployment-input template

## Environment preparation

Create a real .env.production (gitignored, host permissions 0600) from
.env.production.example. It must define the application secrets plus the
Stage 22 deployment fields:

    SITE_ADDRESS          public site address, e.g. https://taxi.example.com
    APP_IMAGE_TAG         exact immutable release identity (see below)
    DATABASE_URL          postgresql://<user>:<password>@postgres:5432/<db>?schema=public
    POSTGRES_USER         must match the DATABASE_URL user
    POSTGRES_PASSWORD     must match the DATABASE_URL password
    POSTGRES_DB           must match the DATABASE_URL database
    BACKUP_DIR            absolute host backup directory (durable, off-repo)
    BACKUP_RETENTION_DAILY  strict positive decimal; default 14
    BACKUP_RETENTION_WEEKLY strict positive decimal; default 8

Never print .env.production contents, never copy it into an image, and never
commit it. Run the canonical pre-deploy configuration gate (it prints only
field names, never credential values):

    npm run production:check -- --env-file .env.production

This exact file is loaded explicitly for the Stage 21 application parsers and
is passed unchanged to `docker compose config`; npm does not implicitly load
`.env.production`. The gate also requires an HTTPS SITE_ADDRESS with no
credentials/path/query/hash, a safe exact APP_IMAGE_TAG other than `latest`, an
absolute off-repository BACKUP_DIR, and exact decoded DATABASE_URL equality with
POSTGRES_USER, POSTGRES_PASSWORD, and POSTGRES_DB at `postgres:5432`. It performs
no DB write and no provider or Telegram request. Explicit backup retention
values must be strict positive decimal integers; zero, empty, negative, and
malformed values fail before a backup can reach `pg_dump`.

## Immutable release identity

Production must identify an exact Git tag/revision. Do not deploy "whatever is
in main". Build and tag application images with the release identity:

    APP_IMAGE_TAG=v1.0.0    # or 0.1.0-<git-short-sha>, never "latest"

    docker build -f apps/api/Dockerfile -t taxi-gps-api:$APP_IMAGE_TAG .
    docker build -f apps/web/Dockerfile \
      --build-arg NEXT_PUBLIC_MAP_STYLE_URL="$NEXT_PUBLIC_MAP_STYLE_URL" \
      -t taxi-gps-web:$APP_IMAGE_TAG .
    docker build -f apps/api/Dockerfile --target migrate -t taxi-gps-migrate:$APP_IMAGE_TAG .

The Compose files reference these images via APP_IMAGE_TAG, so a single
variable pins every application container. The canonical Compose web build
passes NEXT_PUBLIC_MAP_STYLE_URL from the same explicit env file as both a
build argument and runtime validation input. Because NEXT_PUBLIC_* is embedded
in browser output by Next.js, changing the approved map style requires building
a new web image under a new exact immutable APP_IMAGE_TAG. Blank still builds
the OpenFreeMap Positron default; only HTTPS tiles.openfreemap.org is accepted.

## Canonical production configuration gate

Before touching a running system, run all production configuration checks with
the exact env file that Compose will use (no DB write, no provider/Telegram
request):

    npm run production:check -- --env-file .env.production

This one command validates Stage 22 deployment consistency, builds the parser
dependencies, runs the Stage 21 application production configuration parser,
and runs `docker compose -f compose.production.yaml --env-file .env.production
config --quiet` against that same explicit file.

## Clean install / deployment sequence

1.  Verify the exact Git release/tag and check it out.
2.  Create .env.production (0600) and run the canonical explicit-env production
    configuration gate above.
3.  If upgrading a running stack, confirm current health first.
4.  Create a pre-deploy backup (see docs/backup-restore.md) and REQUIRE success.
5.  Verify the pre-deploy backup checksum before any migration.
6.  Build (or pull) the exact immutable application release images.
7.  Run the one-shot migration and REQUIRE success:

        docker compose -f compose.production.yaml --env-file .env.production \
          --profile migrate run --rm migrate

    If migration fails, STOP the deployment. Do not continue to application
    startup, and do not run prisma migrate dev or migrate reset.
8.  Start PostgreSQL and the API, then verify API readiness:

        docker compose -f compose.production.yaml --env-file .env.production up -d postgres api
        docker compose -f compose.production.yaml --env-file .env.production exec api \
          node -e "fetch('http://127.0.0.1:3000/api/health/ready').then(r=>{console.log(r.status);process.exit(r.ok?0:1)})"

9.  Start web, verify web health, then start Caddy and verify the public edge:

        docker compose -f compose.production.yaml --env-file .env.production up -d web caddy
        curl -fsS https://<domain>/api/health | ...

10. Perform read-only / auth smoke checks (login and a representative read).
11. Keep the initial automatic flags false (see below) and observe before
    intentionally enabling any automatic job.

A one-shot migrate is a separate, profile-gated job. docker compose up never
runs it, and the API image has no Prisma CLI, so migrations can never run as an
API startup side effect.

## ADMIN bootstrap

ADMIN creation remains explicit CLI only. Do not auto-bootstrap at container
start and do not put credentials in Compose, the env example, or logs. Use a
one-shot interactive command with a disposable operator-provided password:

    docker compose -f compose.production.yaml --env-file .env.production \
      run --rm api node apps/api/dist/auth-user-create.js

The CLI requires an interactive TTY, accepts no argv credentials, has no
default login/password, and refuses duplicate logins (Stage 21 behavior).

## Initial automatic feature flags

First production deployment should keep automatic/provider-affecting work off
until DB, migrations, API, web, auth, readiness, backup and restore are proven:

    SYNC_SCHEDULER_ENABLED=false
    ALERT_INGESTION_ENABLED=false
    TELEGRAM_NOTIFICATIONS_ENABLED=false
    POSITION_HISTORY_MAINTENANCE_ENABLED=false
    POSITION_HISTORY_RETENTION_ENABLED=false

IMPORTANT: SYNC_SCHEDULER_ENABLED=false disables only the fleet/daily-runs
scheduler. The Stage 18B durable position-history population-run poller is
independent and can perform provider work if a pending/eligible run exists.
First deployment uses a fresh database with no active run, so no provider work
can execute. The shared history mutation advisory lock remains 1706170003.

## Health, readiness and graceful shutdown

    - liveness:  GET /api/health       (no DB)
    - readiness: GET /api/health/ready (DB ping; 200 ready / 503 unavailable)
    - web:       Next standalone accepts HTTP on :3000 (same-container fetch)

Compose healthchecks use only non-mutating checks. API and web containers use
stop_grace_period: 30s and stop on SIGTERM (Nest enableShutdownHooks; Next
standalone graceful shutdown), never kill -9 as standard procedure. Existing
cooperative scheduler/worker shutdown is preserved.

## Logs and resource limits

Application logs go to stdout/stderr. Compose configures bounded json-file
rotation (10m x 5). No ELK/Loki/Prometheus/Grafana (Stage 23). No arbitrary
CPU/RAM limits are set: Stage 24 release-candidate/soak informs final sizing.

## Rollback runbook

Failure BEFORE migration: keep or revert to the previous application release
normally (no schema change was applied).

Failure AFTER migration: do NOT blindly run prisma downgrade. Assess schema
compatibility. If database recovery is required, restore the verified pre-deploy
backup using the explicit procedure in docs/backup-restore.md. Never automate
schema rollback and never run prisma migrate reset in production.

## Destructive-volume warning

docker compose down (without -v) preserves the postgres_data volume. During
ordinary operation NEVER use:

    docker compose down -v

Volume deletion is destructive and is only permitted on explicitly disposable
Stage 22 acceptance projects during final cleanup.

## Stage 23 boundary

Observability, health and failure detection is Stage 23 and is now implemented
as a host-level monitor; see docs/observability.md. This document does not treat
Stage 24 (release-candidate/soak) as implemented.
