# Authentication and permissions

Taxi GPS is an internal application with local username/password accounts. There is no public registration, email identity or recovery, OAuth, or MFA. The migration creates no users; an operator creates the first account interactively with `npm run auth:user-create`.

## Accounts and passwords

Logins contain 3–64 ASCII letters, digits, `.`, `_`, or `-`. Matching uses a separately persisted, unique lower-case canonical login. Passwords contain 15–128 Unicode code points, are not trimmed or truncated, may contain spaces, and have no composition rule or periodic expiry.

Passwords use Node 24's asynchronous built-in Argon2 implementation. Profile version 1 is Argon2id with 65,536 KiB memory, 3 passes, parallelism 4, a new random 16-byte salt, and a 32-byte tag. The database stores the profile version, salt, and derived hash—never the password. Login failures use one generic response, and unknown logins execute a dummy Argon2id verification.

`ADMIN` and `USER` are the only roles. `ADMIN` has unrestricted current and future access without permission rows. `USER` has only recognized, explicitly persisted permissions. Unknown database keys grant nothing. User, role, and permission administration is ADMIN-only; there is no separate user-management permission.

| Permission | Meaning |
|---|---|
| `fleet.view` | Fleet page and fleet dashboard reads |
| `map.view` | Fleet map and map-supporting data |
| `events.view` | Events page and event reads |
| `vehicles.view` | Vehicle detail reads |
| `trips.view` | Exact/overview tracks, trip analysis, and Trips UI |
| `reports.view` | Daily fleet activity reports |
| `historyAdmin.view` | Read-only GPS history administration status |
| `historyAdmin.populate` | Protected bounded GPS history population action; implies history status view |

`trips.view` implies `vehicles.view`; `historyAdmin.populate` implies `historyAdmin.view`. The CLI persists these dependencies.

## Sessions and HTTP boundary

The browser receives one opaque, cryptographically random 32-byte `taxi_session` token. Only its SHA-256 hash is stored server-side. Sessions expire exactly seven days after creation and do not slide: authenticated GETs read the current user, role, disabled state, `mustChangePassword`, and permissions from PostgreSQL but never update session rows or issue rotating cookies. Concurrent sessions are supported. Consequently, administrative role and permission changes affect existing sessions on their next protected request without logout/login. Logout deletes only the current session. A password change atomically replaces the password hash, clears `mustChangePassword`, deletes every prior user session, creates one fresh session, and rotates the current cookie.

The cookie is `HttpOnly; SameSite=Lax; Path=/`, with `Secure` in production and without `Secure` for local HTTP. It has no `Domain`. Tokens are never returned in JSON or stored in JavaScript state, localStorage, sessionStorage, IndexedDB, or URLs.

Nest is authoritative. Global guards protect routes by default. Missing/invalid/expired sessions receive 401; authenticated principals lacking authority receive 403. Disabled accounts cannot authorize existing sessions. A `mustChangePassword` account may use only `/api/auth/me`, `/api/auth/logout`, and `/api/auth/change-password`; product APIs return 403 until the password changes.

Public exceptions are `POST /api/auth/login`, `GET /api/health`, and `GET /api/health/ready`. The same-origin Next BFF exposes matching auth routes, relays Nest `Set-Cookie`, and forwards only the named application cookie on protected upstream calls. All state-changing auth/admin BFF requests require an explicit browser `Origin` equal to the BFF request origin; missing or cross-origin values receive 403 before the write reaches Nest. Forwarded-origin headers are not authority, permissive CORS is not enabled, and state changes never use GET. Health/readiness remain available before login. Provider and operator CLIs do not use browser sessions.

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
| `GET /api/system/position-history/population-runs/active`, `/recent` | `historyAdmin.view` |
| `POST /api/system/position-history/horizon-populate` | `historyAdmin.populate` |
| `POST /api/system/position-history/population-runs` | `historyAdmin.populate` |
| `/admin/users`, `/admin/users/new`, `/admin/users/:id`, all `/api/admin/users` operations | ADMIN role only |
| alert-settings and city-geofence diagnostic APIs | ADMIN-only |
| account/no-access/change-password pages and me/logout/change-password APIs | authenticated account flow |
| health and readiness | public |

Navigation includes only effective global sections. Vehicle links on map/events require `vehicles.view`; report drill-down requires `trips.view`; vehicle-detail map/trip links require their corresponding permission. Nest authorization remains the security boundary.

## ADMIN user management

The global **Администрирование** destination is `/admin/users` for ADMIN and remains `/admin/history` for a USER with `historyAdmin.view`. The administration subnavigation shows **Пользователи** only to ADMIN and **История GPS** to every account with effective history authority. Next protects the page/BFF routes for usability; Nest role authorization remains authoritative and returns 401 for no valid session and 403 for authenticated USER.

The Nest surface is:

- `GET /api/admin/users` and `GET /api/admin/users/:userId` for deterministic safe list/detail reads;
- `POST /api/admin/users` for atomic account/permission creation;
- `PATCH /api/admin/users/:userId/access` for complete role/permission replacement;
- `POST /api/admin/users/:userId/disable` and `/enable` for lifecycle changes;
- `POST /api/admin/users/:userId/reset-password` for administrative recovery.

There is no DELETE route, login rename, hard/soft delete product action, email field or mail recovery. Disabled accounts remain visible. Safe DTOs contain only ID, display login, role, disabled and password-change flags, effective persisted USER permissions, and timestamps—never canonical login, password material, session tokens/hashes, or session rows.

For create and administrative reset, the backend calls Node `crypto.randomBytes(18)` and base64url-encodes the result into an exact 24-character temporary password. The existing versioned Argon2id service hashes it before persistence. Plaintext is never a database argument, file, environment value, URL/query/redirect value, or log field. Client create/reset payloads cannot supply a password. The plaintext is returned once in the authenticated successful POST response, with `Cache-Control: no-store` at Nest and BFF. It is masked by default in ephemeral component memory and can be explicitly shown or copied; dismissal/navigation drops it. No GET or browser storage can recover it.

New and administratively reset accounts have `mustChangePassword=true`. Reset also revokes every target session and creates no replacement session; the temporary password can authenticate only into the existing restricted change-password flow. Disable atomically sets `disabled=true` and deletes every target session. Enable changes only `disabled=false`: old sessions do not return and a fresh login is required. Role, permissions, password, and password-change state otherwise remain intact.

USER permission updates are complete replace-set operations. Unknown keys reject the entire request; `trips.view` expands to `vehicles.view`, and `historyAdmin.populate` expands to `historyAdmin.view` in both UX and backend. Promotion to ADMIN deletes all permission rows. Demotion to USER requires an explicit complete desired permission list, deletes any stale rows, and writes only the normalized replacement set in one transaction. ADMIN authority never depends on permission rows.

An ADMIN cannot disable, demote, or administratively reset themselves; self-service password change remains under **Аккаунт → Сменить пароль**. Disabling or demoting an enabled ADMIN acquires fixed PostgreSQL transaction advisory lock `1706170002`, re-reads the target and enabled ADMIN count inside the transaction, rejects removal of the last enabled ADMIN, then mutates. Access, enable, and ADMIN creation use the same lock where ADMIN cardinality can change, so concurrent reductions cannot commit zero enabled ADMINs. This uses no schema object or migration.

`historyAdmin.populate` exposes both the Stage 17C short confirmation/action and the Stage 18B durable-create controls, while `historyAdmin.view` alone can see horizon status and durable active/recent history, including safe Stage 18C SYSTEM status. ADMIN has both through role authority; both Nest POSTs are permission-protected rather than ADMIN-only. Stage 18B derives USER attribution from the authenticated principal and accepts no browser-supplied identity. Stage 18C's internal scheduler does not impersonate a user, create an account/session, or add a permission; the public API cannot request SYSTEM identity. No authentication audit subsystem is introduced.

## Operator bootstrap account creation

Run `npm run auth:user-create` in a real interactive terminal. It prompts for login, role, recognized USER permissions, password, and confirmation. Password input is hidden and cannot be supplied through argv or an application password environment variable. If a secure TTY is unavailable, the command stops. Creation and permission rows are transactional; duplicate canonical logins produce a safe error. ADMIN accounts need no permission rows.

No default ADMIN is seeded. The bootstrap CLI remains intentionally separate from ADMIN web flows and may accept the operator-entered hidden password. Stage 17C's separately protected population POST reuses these account, session, permission-dependency, disabled-account, and must-change-password rules.
