# Fleet GPS

Fleet GPS is an internal fleet and commercial-vehicle monitoring application.
It is designed for company fleets, service and delivery vehicles, work
vehicles, and mixed commercial fleets. The system synchronizes operational data
from eQuGPS, stores an application-owned view in PostgreSQL, presents it through
an authenticated Web application, evaluates fleet alerts, and delivers
account-specific Telegram notifications.

## Overview

The application gives operators a current fleet overview, vehicle details,
maps, position history, trip/stop analysis, alert history, and a daily activity
report. Background jobs can synchronize provider data, evaluate alerts,
maintain stored history, and dispatch notifications without exposing provider
credentials or the internal API to browsers.

Product behavior is driven by persisted settings and explicit feature gates.
Normal reads use the local PostgreSQL data set; a dashboard or history request
does not silently call the provider or start a synchronization job.

## Key capabilities

### Fleet and live monitoring

- Provider-backed fleet synchronization into a local vehicle registry, current
  vehicle state, and daily statistics.
- Permission-controlled dashboard, current fleet map, and alert map built from
  allow-listed local data.

### Vehicle details, trips, and movement history

- Permission-controlled vehicle details with current position freshness,
  connectivity, daily statistics, and recent events.
- Stored GPS position history with an exact track for ranges up to 24 hours and
  a deterministic sampled overview for ranges up to seven days.
- On-demand trip/stop analysis and a daily fleet activity report derived from
  stored observations under the current global policy.

### Events and reports

- SPEEDING and INACTIVITY detection, durable alert events, and query and
  summary views with a read-only operational inbox and history.
- Daily fleet activity report with fleet-wide summary and permission-aware
  investigation actions.

### GPS history administration and lossless reconciliation

- Controlled history population, status, automatic maintenance, retention
  planning, and bounded retention execution. Lossless reconciliation adds
  durable per-vehicle completeness cursors, default-off continuous lanes with
  restart catch-up, daily 7-day and rolling 90-day replay generations, and a
  protected aggregate ingestion-status surface. See
  [lossless position-history ingestion](docs/lossless-position-history-ingestion.md).
- Revision-protected global business settings for timezone, minimum daily
  distance, position freshness, speeding, inactivity, and trip/stop policy.

### Users, permissions, and business settings

- Local username/password authentication with opaque sessions, forced initial
  password change, `ADMIN` and `USER` roles, and explicit USER permissions.
- ADMIN account management, permission replacement, password reset, account
  enable/disable controls, and a durable administrative audit trail.
- Russian, Ukrainian, and English product localization with explicit
  application timezone semantics.

### Account and Telegram notifications

- Per-user Telegram linking, notification preferences, event-type controls,
  `ALL` or `SELECTED` vehicle scope, recipient planning, and delivery.
- Account overview, security, and notification-preference workspaces with a
  no-access experience for accounts without product permissions.

### Reliability and monitoring

- Liveness/readiness endpoints, production monitoring, bounded logs, verified
  backups, off-host recovery support, and source-controlled operational
  runbooks.

## Architecture

```text
Browser
  -> Caddy (production HTTPS edge)
  -> Next.js Web application and fixed BFF routes
  -> NestJS API
       -> PostgreSQL / Prisma
       -> @taxi-gps/equgps provider adapters
       -> Telegram Bot API
```

The browser communicates only with the Next.js application. Next forwards
narrow, validated requests to the internal NestJS API; the browser never calls
eQuGPS or PostgreSQL directly. In production, only Caddy publishes host ports,
while Web, API, and database traffic use isolated Compose networks.

Schedulers and bounded workers run inside the API process for provider sync,
alert ingestion, position-history maintenance, retention, and notification
delivery. The current operational model uses one active API replica; horizontal
scaling requires shared coordination for process-local schedulers and limits.

## Repository structure

```text
apps/
  api/                 NestJS API, Prisma schema/migrations, workers and CLIs
  web/                 Next.js application, BFF routes and MapLibre UI
packages/
  equgps/              Typed eQuGPS integration boundary
  shared/              Reserved shared-package boundary
src/                   Standalone provider research/probe code
ops/                   Preflight, monitoring, backup/restore and systemd assets
caddy/                 Production and acceptance proxy configuration
data/                  Reviewed source data used by controlled tooling
docs/                  Product, architecture and operations documentation
compose*.yaml          Development, test, acceptance and production topology
dev.ps1                Safe Windows local-development helper
```

## Tech stack

- Node.js 24 (`>=24.7.0 <25`), TypeScript 5.8, npm workspaces.
- Next.js 16, React 19, Tailwind CSS 4, Ant Design 6, and MapLibre GL 6.
- NestJS 11 with Nest Schedule for API and background work.
- Prisma 7.9 with PostgreSQL 17.
- Zod for external and BFF contract validation.
- Docker and Docker Compose; Caddy 2.10 at the production edge.
- Node's built-in test runner plus workspace-specific TypeScript and Web lint
  validation.

## Local development

### Prerequisites

- Node.js in the version range declared above and npm.
- Docker with Docker Compose.
- Windows PowerShell for the repository's `dev.ps1` helper.

From a fresh checkout on Windows:

```powershell
npm ci
Copy-Item .env.example .env
npm run db:up
npm run db:migrate:dev
.\dev.ps1 start
```

Review the local `.env` before startup. The checked-in
[`.env.example`](.env.example) is the development template; `.env` is ignored
and must not be committed. Supply the required local provider identity and
password in `.env`; the development helper disables provider jobs, but API
startup still validates required configuration. `db:migrate:dev` is the normal
development command for applying or creating Prisma migrations. Production
uses the separate, controlled migration procedure in the deployment runbook.

The helper starts or reuses local PostgreSQL, then starts the API on
`http://127.0.0.1:3000` and Web on `http://127.0.0.1:3001`. It deliberately
forces provider schedulers, alert ingestion, automatic history work, legacy
Telegram delivery, and OPS alerts off.

The helper supports exactly:

```powershell
.\dev.ps1 start
.\dev.ps1 status
.\dev.ps1 stop
```

`stop` preserves the PostgreSQL named volume. Useful database commands include
`npm run db:ps`, `npm run db:logs`, and `npm run db:down`. See
[the database test harness](docs/test-database.md) for isolated integration
tests; it does not use the development database or volume.

## Configuration

Configuration is supplied through environment variables, with separate
templates for [development](.env.example) and
[production](.env.production.example). Important groups include:

- PostgreSQL connection and pool settings.
- eQuGPS official/Web integration URLs, credentials, and timeouts.
- the server-only Web-to-API URL and optional public map style.
- explicit gates and bounds for synchronization, alert ingestion, history
  maintenance, retention, and notification workers.
- dedicated product Telegram bot/linking/webhook settings and separate OPS
  alert controls.

Application business policy is not a collection of production environment
magic numbers. ADMIN users manage the revision-protected global settings for
timezone, daily-distance and freshness thresholds, SPEEDING and INACTIVITY
rules, and trip/stop detection. Do not place secrets in Git or expose
server-only configuration through `NEXT_PUBLIC_*` variables.

## Testing

The workspaces expose focused validation rather than one synthetic umbrella
command for every subsystem:

```powershell
npm run api:typecheck
npm run api:test
npm run web:typecheck
npm run web:lint
npm run web:test
npm run web:build
npm run equgps:typecheck
npm run equgps:test
```

- `npm run api:test` builds the API, compiles the unit tests, verifies the
  compiled test inventory matches the current TypeScript sources, and then
  discovers and runs all safe compiled unit tests. Tests that require a real
  database are excluded from this command and remain opt-in through the
  explicit `*-real-db-test` scripts and the isolated test-database harness.
- `npm run web:test` compiles the Web unit tests and runs them with Node's
  built-in test runner, plus the standalone-preparation contract test.
- `npm run web:lint`, `npm run web:typecheck`, and `npm run api:typecheck`
  cover lint and types; `npm run web:build` covers the production Web build.

Root `npm run typecheck`, `npm run build`, and `npm test` validate the retained
standalone provider/probe code. Database-backed tests use the explicit
test-database harness documented in
[docs/test-database.md](docs/test-database.md). Many operational and
feature-specific smoke commands also exist; use the relevant focused
documentation instead of running provider- or write-capable commands casually.

## Telegram notifications

Product Telegram notifications use the dedicated `fleet_signal_bot`. An
eligible account can create a short-lived private-chat link, connect or
disconnect Telegram, enable master notifications, choose SPEEDING and/or
INACTIVITY, and select `ALL` or an allowed `SELECTED` vehicle set.

Confirmed alerts are planned into per-user delivery records. The dispatcher
rechecks the account, permissions, connection revision, preferences, event
type, vehicle scope, and vehicle state before using the dedicated product bot.
Delivery is durable, bounded, retry-aware, and at-least-once.

The production cutover to per-user delivery is complete. Legacy global PRODUCT
Telegram delivery is disabled and is not the active product path. OPS Telegram
alerts remain a separate operational concern with their own enablement gate.
See [Per-user Telegram notifications](docs/telegram-per-user-linking.md) for the
security, data, planning, and delivery contracts.

## Production and operations

Production uses containerized Caddy, Web, API, and PostgreSQL services, plus
explicit one-shot migration, backup, and restore jobs. Public liveness and
database-backed readiness are available at `/api/health` and
`/api/health/ready`. Host-level monitoring checks application, database, proxy,
disk, and backup health; backup procedures include checksum verification,
retention, scheduled jobs, and off-host recovery expectations.

The root README intentionally does not reproduce deployment commands or secret
configuration. Use the authoritative runbooks:

- [Production deployment and operations](docs/deployment.md)
- [Production security contract](docs/production-security.md)
- [Production observability](docs/observability.md)
- [Backup and restore operations](docs/backup-restore.md)

## Documentation

- [Development workflow](docs/development-workflow.md) — branch, pull request,
  CI, review, and squash-merge policy.
- [Development roadmap](docs/development-roadmap.md) — current accepted,
  active, deferred, and operational work.
- [Authentication and permissions](docs/authentication.md) and
  [ADMIN user management](docs/admin-user-management.md).
- [Fleet map API](docs/fleet-map-api.md),
  [vehicle track API](docs/vehicle-track-api.md), and
  [historical track UI](docs/vehicle-track-map-ui.md).
- [Lossless position-history ingestion](docs/lossless-position-history-ingestion.md) — completeness cursors, continuous reconciliation, replay generations, retention integration, and rollout telemetry.
- [Trip/stop analytics](docs/trip-stop-analytics.md) and
  [fleet daily activity report](docs/fleet-daily-activity-report.md).
- [Alert ingestion](docs/fleet-alert-ingestion.md) and
  [audit trail](docs/audit-trail.md).
- [Internationalization](docs/internationalization.md).

## Project status

The project has immutable `v1.0.0` and `v1.1.0` releases, and the `main` source tree is prepared for the `v1.2.0` release line (see Release / version below). Completed product work since `v1.1.0` includes the lossless GPS history ingestion and reconciliation subsystem: durable completeness cursors, continuous recent-tail and contiguous-backlog reconciliation, daily and rolling replay generations, retention-aware completeness, and protected rollout telemetry. Continuous and replay ingestion remain default-off and have not been enabled in production; the controlled rollout readiness assessment returned GO, and the rollout itself is intentionally deferred while further product features are developed. Current production is therefore not described as running the `v1.1.0` source tree.

The old design experiment branches were retired and are not merge or reuse
inputs. See the [development roadmap](docs/development-roadmap.md) for current
status instead of treating proposed work as implemented functionality.

## Release / version

The source tree corresponds to the `v1.2.0` release line, which will be tagged immutably from the prepared `main` SHA after review; until the tag exists, `v1.1.0` remains the latest published GitHub Release. Stable releases are immutable
Git tags; release candidates use the corresponding `-rc.*` suffix. See
[CHANGELOG.md](CHANGELOG.md) for release history. Package versions in
`package.json` files (`0.1.0`) are internal workspace versions, not the product
release version.

## Security notes

- There is no public registration, email recovery, OAuth, or default seeded
  administrator. The first account is created through the interactive,
  hidden-password bootstrap command documented in the authentication guide.
- Nest authorization is authoritative. Sessions are opaque, only their hashes
  are stored, and production cookies are host-only, `HttpOnly`, `Secure`, and
  `SameSite=Lax`.
- Browser traffic stays behind fixed Next.js BFF routes; provider credentials,
  database credentials, Telegram secrets, internal identifiers, and raw
  upstream payloads are not browser contracts.
- Local automatic/provider-affecting work is disabled by default. Enable live
  provider, history, Telegram, or operational behavior only through its
  explicit gated procedure.
- Never commit `.env`, credentials, tokens, backup secrets, or production host
  details.
