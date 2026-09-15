# ADMIN user management

Fleet GPS provides local ADMIN-only account, Product Vehicle Access, and Vehicle
Group management without changing the Argon2id or opaque-session architecture.
The authoritative behavior and route matrix are documented in
[authentication.md](authentication.md#admin-user-management).

Operational summary:

- `/admin/users` lists safe account data; `/admin/users/new` creates accounts; `/admin/users/:userId` changes role, functional permissions, Product Vehicle Access, state, and another account's password.
- `/admin/vehicle-groups` manages named, color-coded groups and their complete vehicle membership. A vehicle is ungrouped or belongs to exactly one group.
- Create and reset use backend `randomBytes(18).toString("base64url")`, return the 24-character temporary password once in a no-store POST response, and never persist plaintext.
- USER permissions and Product Vehicle Access use transactional complete-set replacement. `ALL` means the current and future fleet; `SELECTED` is the union of granted groups and direct vehicles. Promotion clears USER-only rows; demotion requires explicit normalized USER configuration.
- Disable revokes all target sessions; enable requires a new login; reset revokes all target sessions and forces the existing password-change flow.
- Self disable/demotion/admin-reset and removal of the last enabled ADMIN are rejected in Nest. A fixed transaction advisory lock serializes ADMIN-cardinality changes.
- Same-origin BFF checks protect browser writes in addition to Nest authentication and ADMIN authorization.
- There is no account delete, email, registration, password-recovery email, login rename, user-management permission, or GPS population action in account management. Group and access mutations append bounded audit events in the same transaction as their domain changes.

The operator bootstrap command `npm run auth:user-create` remains a separate hidden-password CLI for creating the first account. It does not use the ADMIN UI temporary-password contract.
