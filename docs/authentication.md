# Authentication and permissions

Taxi GPS is an internal application with local username/password accounts. There is no public registration, email identity or recovery, OAuth, or MFA. The migration creates no users; an operator creates the first account interactively with `npm run auth:user-create`.

## Accounts and passwords

Logins contain 3–64 ASCII letters, digits, `.`, `_`, or `-`. Matching uses a separately persisted, unique lower-case canonical login. Passwords contain 15–128 Unicode code points, are not trimmed or truncated, may contain spaces, and have no composition rule or periodic expiry.

Passwords use Node 24's asynchronous built-in Argon2 implementation. Profile version 1 is Argon2id with 65,536 KiB memory, 3 passes, parallelism 4, a new random 16-byte salt, and a 32-byte tag. The database stores the profile version, salt, and derived hash—never the password. Login failures use one generic response, and unknown logins execute a dummy Argon2id verification.

`ADMIN` and `USER` are the only roles. `ADMIN` has unrestricted current and future access without permission rows. `USER` has only recognized, explicitly persisted permissions. Unknown database keys grant nothing. User, role, and permission administration remains ADMIN-only and will receive UI in Stage 17B.

| Permission | Meaning |
|---|---|
| `fleet.view` | Fleet page and fleet dashboard reads |
| `map.view` | Fleet map and map-supporting data |
| `events.view` | Events page and event reads |
| `vehicles.view` | Vehicle detail reads |
| `trips.view` | Exact/overview tracks, trip analysis, and Trips UI |
| `reports.view` | Daily fleet activity reports |
| `historyAdmin.view` | Read-only GPS history administration status |
| `historyAdmin.populate` | Reserved for Stage 17C; no HTTP action exists |

`trips.view` implies `vehicles.view`; `historyAdmin.populate` implies `historyAdmin.view`. The CLI persists these dependencies.

## Sessions and HTTP boundary

The browser receives one opaque, cryptographically random 32-byte `taxi_session` token. Only its SHA-256 hash is stored server-side. Sessions expire exactly seven days after creation and do not slide: authenticated GETs read authority but never update session rows or issue rotating cookies. Concurrent sessions are supported. Logout deletes only the current session. A password change atomically replaces the password hash, clears `mustChangePassword`, deletes every prior user session, creates one fresh session, and rotates the current cookie.

The cookie is `HttpOnly; SameSite=Lax; Path=/`, with `Secure` in production and without `Secure` for local HTTP. It has no `Domain`. Tokens are never returned in JSON or stored in JavaScript state, localStorage, sessionStorage, IndexedDB, or URLs.

Nest is authoritative. Global guards protect routes by default. Missing/invalid/expired sessions receive 401; authenticated principals lacking authority receive 403. Disabled accounts cannot authorize existing sessions. A `mustChangePassword` account may use only `/api/auth/me`, `/api/auth/logout`, and `/api/auth/change-password`; product APIs return 403 until the password changes.

Public exceptions are `POST /api/auth/login`, `GET /api/health`, and `GET /api/health/ready`. The same-origin Next BFF exposes matching auth routes, relays Nest `Set-Cookie`, and forwards only the named application cookie on protected upstream calls. Health/readiness remain available before login. Provider and operator CLIs do not use browser sessions.

## Current access matrix

| Page / API | Authority |
|---|---|
| `/`, `GET /api/dashboard/vehicles`, `GET /api/system/sync-status` | `fleet.view` |
| `/map`, `GET /api/fleet/map` | `map.view` |
| `GET /api/system/city-geofence/map` | any of `map.view`, `trips.view` |
| `GET /api/alert-events/map` | any of `map.view`, `events.view` |
| `/events`, event list and summary APIs | `events.view` |
| `/vehicles/:id`, vehicle details API | `vehicles.view` |
| vehicle track/Trips pages, exact/overview track APIs, trip-analysis API | `trips.view` |
| `/reports`, fleet activity report API | `reports.view` |
| `/admin/history`, position history horizon-status API | `historyAdmin.view` |
| alert-settings and city-geofence diagnostic APIs | ADMIN-only |
| account/no-access/change-password pages and me/logout/change-password APIs | authenticated account flow |
| health and readiness | public |

Navigation includes only effective global sections. Vehicle links on map/events require `vehicles.view`; report drill-down requires `trips.view`; vehicle-detail map/trip links require their corresponding permission. Nest authorization remains the security boundary.

## Operator account creation and future scope

Run `npm run auth:user-create` in a real interactive terminal. It prompts for login, role, recognized USER permissions, password, and confirmation. Password input is hidden and cannot be supplied through argv or an application password environment variable. If a secure TTY is unavailable, the command stops. Creation and permission rows are transactional; duplicate canonical logins produce a safe error. ADMIN accounts need no permission rows.

No default ADMIN is seeded. Stage 17B will add ADMIN-only user management and administrative reset behavior using `mustChangePassword`. Stage 17C will add the separately protected GPS population browser action. There is currently no email recovery, admin reset API/UI, or GPS population HTTP action.
