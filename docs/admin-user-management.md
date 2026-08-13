# ADMIN user management

Stage 17B adds local ADMIN-only account management without changing the Stage 17A schema, migrations, roles, permissions, Argon2id profile, or opaque-session architecture. The authoritative behavior and route matrix are documented in [authentication.md](authentication.md#admin-user-management).

Operational summary:

- `/admin/users` lists safe account data; `/admin/users/new` creates accounts; `/admin/users/:userId` changes role/access, state, and another account's password.
- Create and reset use backend `randomBytes(18).toString("base64url")`, return the 24-character temporary password once in a no-store POST response, and never persist plaintext.
- USER permissions use transactional complete-set replacement and backend dependency expansion. Promotion clears rows; demotion writes an explicit normalized USER set.
- Disable revokes all target sessions; enable requires a new login; reset revokes all target sessions and forces the existing password-change flow.
- Self disable/demotion/admin-reset and removal of the last enabled ADMIN are rejected in Nest. A fixed transaction advisory lock serializes ADMIN-cardinality changes.
- Same-origin BFF checks protect browser writes in addition to Nest authentication and ADMIN authorization.
- There is no delete, email, registration, password-recovery email, login rename, user-management permission, audit subsystem, or GPS population action.

The operator bootstrap command `npm run auth:user-create` remains a separate hidden-password CLI for creating the first account. It does not use the ADMIN UI temporary-password contract.
