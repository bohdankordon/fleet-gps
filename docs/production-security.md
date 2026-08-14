# Production security contract

## Scope and topology

Stage 21 hardens the frozen v1.0 application. It does not implement deployment, the reverse proxy, TLS termination, redirects, backups, monitoring, or any Stage 22/23 work. The production request path remains Internet over HTTPS to a trusted reverse proxy, internal HTTP to Next.js, internal HTTP from the Next BFF to Nest, and then PostgreSQL or approved provider adapters. Browsers do not call Nest directly.

TLS terminates at the trusted reverse proxy. Neither Next nor Nest terminates TLS or makes redirect/security decisions from forwarded headers. `Forwarded`, `X-Forwarded-Host`, `X-Forwarded-Proto`, and `X-Forwarded-For` are not security authority, and the application does not enable blind `trust proxy` behavior.

Nest is an internal BFF target. CORS remains disabled: there is no wildcard origin, credentialed wildcard, or reflected public-origin policy.

## Browser, origin, and cookie boundary

All state-changing Next BFF routes continue to use the centralized `Origin` / `Host` / `Sec-Fetch-Site` policy. Present Fetch Metadata must say `same-origin`; `same-site`, `cross-site`, `none`, empty, and unknown values reject. An explicit Origin must exactly equal external protocol plus Host. Missing or null Origin is accepted only when the already-approved same-origin metadata proves the request. Forwarded headers never participate.

The single `taxi_session` cookie remains host-only and has `HttpOnly; Secure; SameSite=Lax; Path=/` in production. No `Domain` is set. The BFF refuses an insecure or domain-scoped upstream authentication cookie in production. Local development retains a non-Secure cookie for local HTTP. The `taxi_locale` preference remains cookie-only, host-only, `HttpOnly`, `SameSite=Lax`, `Path=/`, one-year `Max-Age`, and `Secure` in production.

The centralized production browser headers are:

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Frame-Options: DENY`
- a Permissions Policy denying unused camera, microphone, geolocation, sensor, payment, USB, capture, media, and fullscreen capabilities
- a CSP with `frame-ancestors 'none'`, `object-src 'none'`, same-origin workers, and no `unsafe-eval`

The production CSP is:

```text
default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://tiles.openfreemap.org; worker-src 'self'; child-src 'self'; frame-src 'none'; media-src 'none'; manifest-src 'self'; upgrade-insecure-requests;
```

Next injects inline bootstrap scripts and styles in the current static/dynamic rendering mix, so the non-nonce policy retains narrowly scoped `'unsafe-inline'` for scripts and styles. A nonce policy would force request-time dynamic rendering and materially change caching/rendering architecture. Production never includes `'unsafe-eval'`. MapLibre uses `/maplibre/maplibre-gl-worker.mjs` on the application origin. Source inventory finds only the OpenFreeMap style origin `https://tiles.openfreemap.org`; it is allowed only by `connect-src`. No Mapbox, Google Maps, routing, geocoding, WebSocket, or SSE origin is allowed. Production browser source maps are explicitly disabled.

## Authentication and sessions

Login normalization remains the existing ASCII `3..64` policy with lowercase canonical comparison. Passwords use Node's asynchronous Argon2id implementation, version 1, with 65,536 KiB memory, three passes, parallelism four, random 16-byte salts, and 32-byte tags. Plaintext passwords are never persisted. ADMIN temporary/reset passwords use the same hashing path, revoke the user's sessions transactionally, and are returned only in the already-approved one-time UI response.

Sessions are opaque 32-byte cryptographic random values encoded as base64url. Only SHA-256 token hashes are stored. Absolute lifetime is seven days and expiry, user-disabled state, logout revocation, password-change rotation, and ADMIN reset/disable revocation are enforced server-side. Each login creates a fresh session; no guest or pre-authentication identifier is promoted. Own password change revokes all previous sessions and creates one fresh replacement in the credential transaction.

The ADMIN bootstrap remains an explicit interactive CLI action. It requires a secure TTY, accepts no argv credentials, has no default login/password, never runs during application startup, and refuses duplicate logins. Existing self-protection, ADMIN-only management, and last-enabled-ADMIN locking remain unchanged.

## Login limiter

`POST /api/auth/login` has an in-process first barrier keyed only by the existing canonical login. Five credential failures in a 15-minute window activate a fixed 15-minute block. The fifth failed authentication retains the generic credential response; subsequent attempts during the block receive HTTP 429 with only `LOGIN_RATE_LIMITED`. Blocked requests do not extend the block. A successful login before blocking clears the bucket. Unknown logins and wrong passwords use the same accounting behavior, while malformed/noncanonical login bodies create no bucket.

The cache holds at most 10,000 buckets. Expired entries are reclaimed opportunistically; at capacity the deterministic least-recently-used/oldest entry is evicted. State resets at process restart and is per-process/per-instance, not distributed or global. No database table, Redis, account disable, audit event, or permanent lockout is involved. Source-IP limiting is deliberately absent because Stage 22 has not established a trusted reverse-proxy client-IP boundary; `X-Forwarded-For` is not trusted as a substitute.

## Configuration and secrets

`npm run production:check -- --env-file .env.production` explicitly loads the exact production env file for the same API and web parsers used by runtime startup, then validates Stage 22 deployment fields and the production Compose configuration with that same file. It performs no database write and no provider or Telegram request. Nest configuration is parsed during module construction before listening. The production Next start wrapper validates before spawning the standalone server; the production-server config phase and `instrumentation.register()` repeat the same check as defense in depth. Missing security-critical values, malformed URLs/integers, malformed nonempty booleans, and known repository placeholder secrets fail with field names only. The BFF also enforces production cookie attributes. Use [`.env.production.example`](../.env.production.example) as the sanitized deployment-input template; never commit a real `.env`.

| Variable | Production classification | Default / bounds |
| --- | --- | --- |
| `NODE_ENV` | Required production mode/security selector | `production` |
| `HOST` | Optional listener host | `127.0.0.1`; nonempty |
| `PORT` | Optional integer | `3000`; 1..65535 |
| `API_INTERNAL_BASE_URL` | Required internal URL | HTTP/HTTPS; no credentials/query/fragment |
| `NEXT_PUBLIC_MAP_STYLE_URL` | Optional public URL | blank = Positron; HTTPS `tiles.openfreemap.org` only |
| `DATABASE_URL` | Required secret URL | PostgreSQL URL; production user/password required; known placeholders reject |
| `DATABASE_POOL_MAX` | Optional integer | 10; 1..100 |
| `DATABASE_CONNECTION_TIMEOUT_MS` | Optional duration | 5000; 100..120000 ms |
| `DATABASE_IDLE_TIMEOUT_MS` | Optional duration | 30000; 1000..600000 ms |
| `EQUGPS_BASE_URL` | Required provider URL | HTTPS, no credentials/query/fragment |
| `EQUGPS_WEB_BASE_URL` | Required provider URL | HTTPS, no credentials/query/fragment |
| `EQUGPS_EMAIL` | Required provider identity | nonempty |
| `EQUGPS_PASSWORD` | Required provider secret | nonempty; known placeholders reject in production |
| `EQUGPS_REQUEST_TIMEOUT_MS` | Optional duration | 15000; 1000..120000 ms |
| `EQUGPS_RUNS_TIMEOUT_MS` | Optional duration | 45000; 1000..120000 ms |
| `SYNC_SCHEDULER_ENABLED` | Optional strict boolean | false |
| `FLEET_SYNC_INTERVAL_SECONDS` | Optional integer | 60; 15..3600 s |
| `RUNS_SYNC_INTERVAL_SECONDS` | Optional integer | 300; 60..3600 s |
| `SYNC_SCHEDULER_SHUTDOWN_TIMEOUT_MS` | Optional duration | 50000; 1000..120000 ms |
| `ALERT_INGESTION_ENABLED` | Optional strict boolean | false |
| `POSITION_HISTORY_MAINTENANCE_ENABLED` | Optional strict boolean | false |
| `POSITION_HISTORY_RETENTION_ENABLED` | Optional strict boolean | false |
| `TELEGRAM_NOTIFICATIONS_ENABLED` | Optional strict boolean | false |
| `TELEGRAM_BOT_TOKEN` | Conditional secret | required/non-placeholder only when Telegram is enabled |
| `TELEGRAM_CHAT_ID` | Conditional sensitive value | required/non-placeholder only when Telegram is enabled |
| `TELEGRAM_NOTIFICATION_DISPATCH_INTERVAL_MS` | Optional duration | 60000; 1000..3600000 ms |
| `TELEGRAM_NOTIFICATION_BATCH_SIZE` | Optional integer | 20; 1..100 |

Only exact lowercase `true` and `false` are accepted operational boolean values. Missing flags remain false. Values such as `TRUE`, `1`, `yes`, `on`, or a typo fail validation and cannot enable work.

Repository tooling additionally reads `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, and `POSTGRES_PORT` for local Compose; `EQUGPS_TIMEZONE` and `EQUGPS_WEB_TOKEN` for legacy read-only probe commands; `ALLOW_REAL_EQUGPS_REQUESTS` and `ALLOW_DATABASE_WRITES` for an explicitly gated live scheduler smoke; and `LOCAL_WEB_BASE_URL` for the local observer. These are not application production-runtime inputs and are intentionally absent from the production template.

Disabling `SYNC_SCHEDULER_ENABLED` disables only the fleet/daily-runs scheduler. The Stage 18B durable population-run poller is independent and can perform provider work when a pending/eligible run exists. Production acceptance must prove no active run or use the already-approved safe lock/runtime mechanism. The shared history mutation advisory lock remains `1706170003`.

## Request, error, log, and health posture

Nest's Express JSON parser keeps its built-in 100 KiB limit, which is stricter than the approved 256 KiB ceiling. Current Next state-changing BFF handlers share a 64 KiB streaming reader for JSON and form bodies. Declared or streamed oversize bodies return safe 413 responses before authentication, database, or provider work. There are no uploads or exceptions.

Unexpected BFF/auth/provider failures are reduced to stable safe status/code bodies. The UI localizes codes and never treats raw backend messages as display authority. Application-controlled logs contain fixed operational outcomes only; passwords, hashes, salts, cookies, Authorization values, provider/Telegram tokens, database credentials, and request bodies are not logged. Health and readiness expose only service/status/timestamp facts, never configuration, SQL, stacks, paths, or credentials.

No Swagger/OpenAPI explorer, debug/test/fixture/acceptance production route, permissive CORS surface, or public production source-map download is present. Acceptance scripts remain repository-only. Dependency advisories are attempted read-only when registry access is available; Stage 21 never runs automatic audit fixes or unrelated upgrades.

Stage 22 dependency triage later obtained registry results: both `npm audit --omit=dev --json` and full `npm audit --json` initially reported `nanoid@3.3.17` below `3.3.18` (GHSA-2v37-7h3g-55p8), with no critical finding. The explicitly approved lockfile-only remediation updated that npm-managed transitive resolution to `3.3.18`; both audit scopes then reported zero findings. It is reached through PostCSS via Next.js (and the Tailwind build chain); no application source imports Nanoid or custom generators. Next 16.3.0 separately carries a vendored compiled Nanoid module, which the lockfile does not replace; installed-Next/application inspection found no custom-generator callsite or zero-size path. No audit fix, automatic upgrade, Next upgrade, node_modules patch, or fork was used. Registry tooling traffic occurred; application/provider traffic remained zero.

A bounded high-signal scan of current source and reachable Git history found no probable real secret. Raw credentialed-database-URL matches were confined to documented local defaults and synthetic test fixtures; no Telegram-token shape, literal Bearer/Basic credential, or private-key material was found. The real `.env` is ignored, was not printed or copied, and remains unchanged. Provider and Telegram transports convert failures to fixed classifications and application logs never include request credentials, URLs containing tokens, raw bodies, cookies, or authorization headers.

## Frozen architecture facts

The Prisma schema and all 11 migrations remain unchanged. History budgets remain Stage 17C `6/12/24`, Stage 18B `500/1000/5000`, Stage 18C at `03:00 UTC` with SYSTEM budget `5000`, Stage 19C at `06:00 UTC`, and retention limits `5000` checkpoints / `25000` observations. Localization remains exactly `ru`, `uk`, `en`, default `ru`, unprefixed URLs, `taxi_locale` cookie preference, no Accept-Language detection, and Europe/Kyiv display authority.
