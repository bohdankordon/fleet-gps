# Production observability, health and failure detection (Stage 23)

Stage 23 adds a small, production-safe, host-level operational failure-detection
layer for the single-host Docker Compose deployment. It is an operations
subsystem, not a product feature: nothing is added to Nest, Next, the database
schema, or the public API.

## Architecture

    systemd timer (every 60 seconds)
      |
      v
    host-level read-only monitor (ops/monitor-host.sh -> ops/monitor-host.mjs)
      |
      v
    Docker / local-edge / readiness / disk / backup checks
      |
      v
    incident transition (pure state machine)
      |
      v
    optional host-level Telegram operational notification

The monitor is a one-shot Node 24 process (the same toolchain Stage 22 already
uses for production preflight). It runs entirely on the host, reads the explicit
production env file, performs no application database writes, and performs no
provider requests. Recovery from unhealthy to healthy produces one recovery
notification.

The selected explicit env file is the sole authority for production
application, deployment, monitor, and notifier configuration. Host execution
variables such as PATH, HOME, DOCKER_HOST, and DOCKER_CONTEXT remain available
to tooling, but cannot supply missing production configuration or override
Compose interpolation passed through that explicit env file.

## Checks and stable check IDs

Each check has a stable, machine-oriented ID and one of three severities:
healthy, warning, or critical. The IDs are:

    DOCKER_ENGINE
    CONTAINER_CADDY
    CONTAINER_WEB
    CONTAINER_API
    CONTAINER_POSTGRES
    EDGE_HTTPS
    API_READINESS
    POSTGRES_READINESS
    DB_DISK
    BACKUP_DISK
    BACKUP_MISSING
    BACKUP_STALE
    BACKUP_INVALID
    BACKUP_VERIFY_UNAVAILABLE

Docker and container checks: the production Compose stack is inspected through
the same explicit env file used by deployment. Caddy, web, api and postgres must
be running; Docker health state is used when present. stopped, exited,
restarting and unhealthy states are incidents. If Docker Engine itself is
unavailable, the monitor emits one stable DOCKER_ENGINE critical incident rather
than four misleading container incidents.

Local-edge HTTPS check: the monitor probes the real production HTTPS origin
(SITE_ADDRESS) using a representative read-only GET of /login. DNS is resolved
to loopback locally for the probe while TLS SNI, certificate hostname
validation, and the production Host header are all preserved. TLS verification
is never disabled; Next is not probed directly, and public DNS hairpin behavior
is not relied upon.

API readiness: the existing /api/health/ready endpoint is checked through the
private Docker network (docker compose exec), never by publishing an API host
port or changing Caddy routing. No provider request occurs.

PostgreSQL readiness: the existing pg_isready healthcheck is exercised through
the container's own environment. No SQL mutation and no credential output.

Disk checks: free-space percentage is monitored for the PostgreSQL persistent
data filesystem (discovered authoritatively from Docker/Compose state, never
hard-coded and never the developer database) and for BACKUP_DIR.
When Docker Engine is reachable but the PostgreSQL data mount cannot be
discovered or its filesystem cannot be inspected, DB_DISK is CRITICAL; the
check never disappears silently. When Docker Engine itself is unavailable, the
single DOCKER_ENGINE incident remains authoritative.

## Disk thresholds

The same exact thresholds apply to both DB_DISK and BACKUP_DISK:

    free >= 15%            healthy
    5% <= free < 15%       WARNING
    free < 5%              CRITICAL

Monitoring only detects low disk; it never deletes databases or backups to fix
it.

## Backup freshness and integrity

The monitor watches the canonical daily managed backup output under
BACKUP_DIR/daily. Only exact managed pairs (taxi-gps-YYYY-MM-DDTHHMMSSZ.dump plus
its .sha256 sidecar) that are regular, non-symlink files count.

    no finalized managed daily pair           BACKUP_MISSING (CRITICAL)
    latest finalized daily pair older than 30h BACKUP_STALE   (CRITICAL)
    completed verification rejects latest pair BACKUP_INVALID (CRITICAL)
    verification cannot complete              BACKUP_VERIFY_UNAVAILABLE (WARNING)

Integrity reuses the accepted Stage 22 checksum verifier (ops/backup-verify.sh);
no second, weaker parser is introduced. No restore and no database mutation are
performed.
The verifier has a dedicated 30-second timeout; ordinary probes retain their
10-second timeout. A timeout or execution failure does not prove corruption.

## Integrity verification cache

The monitor does not SHA-256 a potentially large production dump every minute
forever. A small cache in the state directory records the verified identity
(basename, size and mtime of both files). A newly observed or replaced pair is
always verified; a changed file identity is re-verified; an unchanged pair is
re-verified on a bounded 6-hour interval. The cache is not a substitute for
Stage 22 backup-time verification, and a cached result is never trusted for a
different backup basename or file identity.
Successful verification advances the cache timestamp; a completed rejection
invalidates the cache. If verification cannot complete, the monitor preserves
any prior cache without advancing its timestamp or creating a successful entry.
The current pair remains due for verification on a later run.

## Incident dedup and notifications

Incident identity derives from stable facts only: check ID plus severity.
Timestamps and variable error text never change identity.

    healthy -> unhealthy                 one immediate alert
    same incident persists               no alert each minute
    incident set or severity changes     one immediate updated alert
    WARNING -> CRITICAL escalation       one immediate alert
    unchanged incident, 6h since last
      successful notification            one reminder (then every 6h)
    unhealthy -> healthy                 one recovery notification

Recovery summarizes the previously active stable check IDs safely. Only a
successful notification advances notification state; a failed delivery is
retried on the next 60-second run.

## Alerts configuration

Operational alerts use OPS_ALERTS_ENABLED, which defaults to false. It is fully
independent from TELEGRAM_NOTIFICATIONS_ENABLED: product Telegram notifications
may be off while operational alerts are on, and vice versa. Operational alerts
reuse the existing TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID; no second Telegram
credential is introduced.

    OPS_ALERTS_ENABLED=false   valid without operational Telegram credentials
    OPS_ALERTS_ENABLED=true    requires a nonempty TELEGRAM_BOT_TOKEN and
                               TELEGRAM_CHAT_ID

Only the strict strings true and false are accepted; anything else fails the
production preflight.

## Telegram secret handling

The host notifier (ops/lib/monitor-notify.mjs) sends through an in-memory fetch
with a strict timeout. The bot token is never placed in process argv,
ps-visible command arguments, stdout, stderr, the systemd journal, an incident
body, a temporary filename, or exception text. Raw Telegram API response bodies
are never logged. A delivery is reported successful only when Telegram returns
ok true.

Systemd failure notifications validate only OPS_ALERTS_ENABLED and the Telegram
token/chat facts needed for delivery. They deliberately do not depend on
SITE_ADDRESS, APP_IMAGE_TAG, BACKUP_DIR, Docker, PostgreSQL, Nest, or Next, so an
unrelated monitoring/deployment failure cannot disable its own OnFailure alert.
The manual TEST kind additionally validates SITE_ADDRESS and APP_IMAGE_TAG
because those safe facts appear in its message.

There is an unavoidable boundary: if the explicit env file is missing,
unreadable, or unparseable, or if operational alerts are enabled but the
Telegram token/chat configuration itself is missing or invalid, Telegram
delivery cannot occur. The notifier reports that failure safely without
printing credential values.

## Manual TEST notification

After enabling OPS_ALERTS_ENABLED=true, an operator can prove real Telegram
delivery with one clearly-marked TEST message (no secrets):

    sh ops/notify-host.sh test .env.production

The TEST procedure is for real deployments only; automated acceptance sends zero
real Telegram requests.

## Systemd installation (operator-only, not automated)

Source-controlled examples live in ops/systemd. Install and enable as an
explicit operator action:

    sudo cp ops/systemd/taxi-gps-monitor.service \
            ops/systemd/taxi-gps-monitor.timer \
            ops/systemd/taxi-gps-ops-notify@.service \
            /etc/systemd/system/
    sudo systemctl daemon-reload
    sudo systemctl enable --now taxi-gps-monitor.timer

Adjust WorkingDirectory and the absolute wrapper paths to the checkout
(/opt/taxi-gps in the examples) and confirm .env.production exists there.

## Cadence and overlap prevention

The timer runs the monitor approximately every 60 seconds. The service is
Type=oneshot and the wrapper (ops/monitor-host.sh) holds a crash-released kernel
flock (/run/lock/taxi-gps-monitor.lock) for the duration of one run, so
overlapping runs are prevented without a stale mkdir lock. A run is
time-bounded (TimeoutStartSec=45) and individual probes have their own
timeouts.

## Monitor success vs incidents

A monitor that successfully executes and detects an unhealthy application has
done its job, so it exits 0 even with active incidents. Monitor exit nonzero is
reserved for internal failures (invalid configuration, unreadable/unsafe state,
or an untrustworthy implementation). Ordinary application incidents therefore
never trigger systemd OnFailure every minute; only genuine monitor execution
failures do.

## Backup and monitor self-failure alerting

The daily and weekly backup services carry OnFailure units that send an
immediate operational notification through the same host notifier when a backup
job fails. The monitor service carries a nonrecursive OnFailure unit for monitor
execution failure. The notifier template has no OnFailure, so notification can
never recurse into itself. Pre-deploy backup remains a synchronous deployment
gate and needs no asynchronous notification.

## State directory

Monitor state lives in /var/lib/taxi-gps/monitor (directory mode 0700, files
0600), owned by the host operational user/root. Writes are atomic (temp +
fsync + rename) and never follow attacker-controlled symlinks. No credentials
are stored. Malformed incident state fails safely rather than being silently
discarded in a way that could suppress an incident. This production location is
fixed: .env.production and inherited process environment cannot redirect it,
which prevents an environment typo from chmodding an arbitrary host directory.

## Boundaries

The monitor makes no provider health calls (no eQuGPS, OpenFreeMap, routing,
geocoding, or translation), performs zero application database writes, adds no
schema/migration, and adds no Prometheus/Grafana/Loki/ELK/OpenTelemetry/Sentry/PagerDuty/Redis. Application
scheduler semantics are unchanged. The host monitor itself added no application endpoint, page, or permission: it only reads existing health signals from the host side.

## Host monitoring vs application history-ingestion status

Host failure monitoring (this document) and application history-ingestion operational status are distinct subsystems that do not replace each other. The monitor watches host, container, edge, readiness, disk, and backup health and notifies operators about failures. Separately, the lossless history subsystem exposes a permissioned, read-only aggregate status for rollout observability: the protected same-origin BFF route `GET /api/system/position-history/ingestion-status` (forwarded to the internal Nest API, `historyAdmin.view` authority, `Cache-Control: no-store` on both responses), covering request-rate, failure, retry, lock, cursor-lag, replay-debt, and retention execution and alignment telemetry. See [lossless position-history ingestion](lossless-position-history-ingestion.md).

## Troubleshooting safe logs

Each successful run emits one concise machine-readable JSON summary on stdout
with the timestamp, overall severity, per-check statuses, incident count, and
timing facts. No secrets or raw command output appear. For a failing monitor,
inspect journalctl -u taxi-gps-monitor for the safe error line (invalid field
names only, never credential values).

## Stage 24 boundary

Stage 23 ends here. Stage 24 (release-candidate/soak, final sizing) is not
implemented and must not be started as part of this stage.
