# Authentication and permissions

Fleet GPS is an internal application with local username/password accounts. There is no public registration, email identity or recovery, OAuth, or MFA. The migration creates no users; an operator creates the first account interactively with `npm run auth:user-create`.

## Accounts and passwords

Logins contain 3–64 ASCII letters, digits, `.`, `_`, or `-`. Matching uses a separately persisted, unique lower-case canonical login. A human-selected new password must contain 12–128 Unicode code points. It is not trimmed, normalized, or truncated before hashing; spaces and all character classes are allowed, with no mandatory upper/lowercase letter, digit, or special character and no periodic expiry. New passwords are screened locally against common-password and narrow account/product-context guesses. No password or screening representation is sent to an external password service.

The policy applies when changing a password (including the forced initial/reset flow) and when supplying a bootstrap password to `auth:user-create`. It does not retroactively invalidate stored credentials: an existing short or common password remains valid for login until the account next establishes a password. A replacement must differ exactly from the verified current password. Screening normalization is used only for lookup and never changes the raw value passed to Argon2id.

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

## Product Vehicle Access

Functional permissions answer which product actions a user may perform.
Product Vehicle Access independently answers which vehicles those actions may
use. `ADMIN` always has the full current and future fleet. A `USER` is configured
explicitly as either `ALL`, which also includes future vehicles, or `SELECTED`,
which is the union of vehicles in granted groups and directly granted vehicles.
A direct grant may overlap a group grant; effective results are deduplicated and
there are no deny rules.

Each vehicle belongs to zero or one real Vehicle Group. An ungrouped vehicle has
`groupId = null`; “Ungrouped” is not persisted as a group and cannot be granted.
Groups have a name and one curated display color. Color is presentation metadata
only and never changes authorization, notification eligibility, events, reports,
or history behavior. Group-derived access is evaluated from current membership,
so a rename, color change, or membership move is visible on the next read.

Product collection and aggregate queries apply the vehicle scope in PostgreSQL
and omit inaccessible vehicles and group metadata. A direct request for an
existing but inaccessible vehicle returns the same 404 as a missing vehicle;
missing functional permission retains the normal 403. `SELECTED` with no
effective vehicles is a valid empty product scope. The system-wide
`historyAdmin.view` and `historyAdmin.populate` operations intentionally remain
outside Product Vehicle Access.

## Sessions and HTTP boundary

The browser receives one opaque, cryptographically random 32-byte `taxi_session` token. Only its SHA-256 hash is stored server-side. Sessions expire exactly seven days after creation and do not slide: authenticated GETs read the current user, role, disabled state, `mustChangePassword`, and permissions from PostgreSQL but never update session rows or issue rotating cookies. Concurrent sessions are supported. Consequently, administrative role and permission changes affect existing sessions on their next protected request without logout/login. Logout deletes only the current session. A password change atomically replaces the password hash, clears `mustChangePassword`, deletes every prior user session, creates one fresh session, and rotates the current cookie.

The cookie is `HttpOnly; SameSite=Lax; Path=/`, with `Secure` in production and without `Secure` for local HTTP. It has no `Domain`. Tokens are never returned in JSON or stored in JavaScript state, localStorage, sessionStorage, IndexedDB, or URLs.

Nest is authoritative. Global guards protect routes by default. Missing/invalid/expired sessions receive 401; authenticated principals lacking authority receive 403. Disabled accounts cannot authorize existing sessions. A `mustChangePassword` account may use only `/api/auth/me`, `/api/auth/logout`, and `/api/auth/change-password`; product APIs return 403 until the password changes.

Public exceptions are `POST /api/auth/login`, `GET /api/health`, and `GET /api/health/ready`. The same-origin Next BFF exposes matching auth routes, relays Nest `Set-Cookie`, and forwards only the named application cookie on protected upstream calls. All state-changing auth/admin BFF requests require an explicit browser `Origin` equal to the BFF request origin; missing or cross-origin values receive 403 before the write reaches Nest. Forwarded-origin headers are not authority, permissive CORS is not enabled, and state changes never use GET. Health/readiness remain available before login. Provider and operator CLIs do not use browser sessions.

### Auth resolution: authenticated, unauthenticated, unavailable

The Web layer resolves the session into exactly one of three states
(`apps/web/src/lib/auth/auth-resolution.ts`):

- `authenticated` — `/api/auth/me` returned 200 with a valid user payload.
- `unauthenticated` — no session token is present, or `/api/auth/me`
  returned 401. Only a true 401 means unauthenticated.
- `unavailable` — anything else: transport failure, an unexpected non-401
  status, or a 200 response whose payload fails validation.

Infrastructure uncertainty therefore never logs the user out and never
presents the session as rejected; it surfaces an explicit temporarily
unavailable experience with a retry path instead. Nest remains authoritative:
missing/invalid/expired sessions receive 401, and authenticated principals
lacking authority receive 403, as above.

## Current access matrix

| Page / API | Authority |
|---|---|
| `/`, `GET /api/dashboard/vehicles`, `GET /api/system/sync-status` | `fleet.view`; vehicle-backed dashboard data is Product Vehicle Access scoped |
| `/map`, `GET /api/fleet/map` | `map.view`; fleet and alert-map vehicle data is Product Vehicle Access scoped |
| `GET /api/system/city-geofence/map` | any of `map.view`, `trips.view` |
| `GET /api/alert-events/map` | any of `map.view`, `events.view` |
| `/events`, event list and summary APIs | `events.view`; Product Vehicle Access scoped |
| `/vehicles/:id`, vehicle details API | `vehicles.view`; Product Vehicle Access scoped |
| vehicle track/Trips pages, exact/overview track APIs, trip-analysis API | `trips.view`; Product Vehicle Access scoped |
| `/reports`, fleet activity report API | `reports.view`; Product Vehicle Access scoped |
| `/admin/history`, `/admin/history/population`, position history ingestion-status and horizon-plan APIs | `historyAdmin.view` |
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
- `POST /api/admin/users` for atomic account, permission, and Product Vehicle Access creation;
- `PATCH /api/admin/users/:userId/access` for complete role, permission, and Product Vehicle Access replacement;
- `POST /api/admin/users/:userId/disable` and `/enable` for lifecycle changes;
- `POST /api/admin/users/:userId/reset-password` for administrative recovery.

There is no DELETE route, login rename, hard/soft delete product action, email field or mail recovery. Disabled accounts remain visible. Safe DTOs contain only ID, display login, role, disabled and password-change flags, effective persisted USER permissions, and timestamps—never canonical login, password material, session tokens/hashes, or session rows.

For create and administrative reset, the backend calls Node `crypto.randomBytes(18)` and base64url-encodes the result into an exact 24-character temporary password. The existing versioned Argon2id service hashes it before persistence. Plaintext is never a database argument, file, environment value, URL/query/redirect value, or log field. Client create/reset payloads cannot supply a password. The plaintext is returned once in the authenticated successful POST response, with `Cache-Control: no-store` at Nest and BFF. It is masked by default in ephemeral component memory and can be explicitly shown or copied; dismissal/navigation drops it. No GET or browser storage can recover it.

Random administrative temporary passwords remain outside the human common-password screening path. They retain 18 random input bytes, the exact 24-character base64url format, `mustChangePassword`, and reset session revocation; the user-selected replacement is screened normally.

New and administratively reset accounts have `mustChangePassword=true`. Reset also revokes every target session and creates no replacement session; the temporary password can authenticate only into the existing restricted change-password flow. Disable atomically sets `disabled=true` and deletes every target session. Enable changes only `disabled=false`: old sessions do not return and a fresh login is required. Role, permissions, password, and password-change state otherwise remain intact.

USER permission and vehicle-access updates are complete replace-set operations.
Unknown keys or vehicle/group references reject the entire request;
`trips.view` expands to `vehicles.view`, and `historyAdmin.populate` expands to
`historyAdmin.view` in both UX and backend. Promotion to ADMIN deletes all
permission and vehicle-grant rows and stores the canonical full-fleet state.
Demotion to USER requires explicit complete functional and vehicle-access
configuration, deletes stale rows, and writes only the normalized replacement
sets in one transaction. Dormant USER ACL state is never resurrected. ADMIN
authority never depends on permission or grant rows.

Vehicle Group administration is ADMIN-only under `/api/admin/vehicle-groups`.
It supports list, create, detail, name/color update, complete membership
replacement, and delete. Replacing membership may move a vehicle from its prior
group. Deleting a group leaves its vehicles ungrouped, removes group grants by
foreign-key cascade, and preserves direct vehicle grants.

An ADMIN cannot disable, demote, or administratively reset themselves; self-service password change remains under **Аккаунт → Сменить пароль**. Disabling or demoting an enabled ADMIN acquires fixed PostgreSQL transaction advisory lock `1706170002`, re-reads the target and enabled ADMIN count inside the transaction, rejects removal of the last enabled ADMIN, then mutates. Access, enable, and ADMIN creation use the same lock where ADMIN cardinality can change, so concurrent reductions cannot commit zero enabled ADMINs. This uses no schema object or migration.

`historyAdmin.populate` exposes both the Stage 17C short confirmation/action and the Stage 18B durable-create controls, while `historyAdmin.view` alone can see horizon status and durable active/recent history, including safe Stage 18C SYSTEM status. ADMIN has both through role authority; both Nest POSTs are permission-protected rather than ADMIN-only. Stage 18B derives USER attribution from the authenticated principal and accepts no browser-supplied identity. Stage 18C's internal scheduler does not impersonate a user, create an account/session, or add a permission; the public API cannot request SYSTEM identity. No authentication audit subsystem is introduced.

## Operator bootstrap account creation

Run `npm run auth:user-create` in a real interactive terminal. It prompts for login, role, recognized USER permissions, password, and confirmation. Password input is hidden and cannot be supplied through argv or an application password environment variable. If a secure TTY is unavailable, the command stops. Creation and permission rows are transactional; duplicate canonical logins produce a safe error. ADMIN accounts need no permission rows.

No default ADMIN is seeded. The bootstrap CLI remains intentionally separate from ADMIN web flows and may accept the operator-entered hidden password. Stage 17C's separately protected population POST reuses these account, session, permission-dependency, disabled-account, and must-change-password rules.

## Common-password blocklist maintenance

The checked-in `apps/api/assets/password-policy/common-passwords.bin` is a sorted fixed-width index of full SHA-256 digests; the upstream plaintext corpus is not committed or shipped. The API loads and validates the compact binary once per process and uses exact binary search. A missing, malformed, unsorted, duplicated, source-mismatched, or checksum-mismatched required artifact prevents the auth runtime from loading rather than disabling screening.

Maintainers regenerate explicitly with `npm run password-blocklist:generate`. The script downloads only `Passwords/Common-Credentials/Pwdb_top-1000000.txt` from `danielmiessler/SecLists` commit `e57f8ad37904658709bceb20b82f22a0e9f2046f`, verifies Git blob `99665aeb16c221dfb9a258e39dd58fa37116cfdd` and the pinned downloaded SHA-256, then writes deterministic binary and metadata files. Regeneration is not part of install, build, startup, CI, or tests. Review both generated checksums/counts and the upstream attribution notice before committing an update.
