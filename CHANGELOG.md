# Changelog

All notable changes to Fleet GPS are documented here. Release versions are
immutable Git tags; package versions in `package.json` files are internal
workspace versions, not the product release version.

## [1.1.0] - 2026-09-13

### Added

- Secure per-user Telegram linking with short-lived private-chat links,
  account-owned notification preferences with revision protection and `ALL` or
  `SELECTED` vehicle scope, recipient-aware planning and dispatch, and the
  production cutover to per-user delivery (legacy global product delivery
  disabled).
- Revision-protected global ADMIN business settings, including trip/stop
  detection policy migrated from code constants to persisted policy.
- Administration workspaces for users, business settings, audit, and GPS
  history, with ADMIN-only user lifecycle controls and a durable audit trail.
- Account workspaces for overview, security, Telegram connection, and
  notification preferences, including a no-access experience for accounts
  without product permissions.
- Behavior-preserving Ant Design interface across Fleet, Map, vehicle details,
  trips, movement history, events, reports, account, administration, and the
  shared application header.
- Isolated Linux PostgreSQL test harness for real-database integration tests,
  separate from development and production data.
- Windows local-development helper `dev.ps1` (`start` / `status` / `stop`)
  with provider and automatic jobs forced off by default.

### Changed

- The API standard test command (`npm run api:test`) now discovers and runs
  all safe compiled unit tests; real-database tests remain opt-in and separate.
- The Web layer distinguishes authentication unavailability (transport or
  backend failure) from unauthenticated state; only a true `401` from
  `/api/auth/me` means unauthenticated.
- Visible product brand is Fleet GPS. Technical identifiers (`taxi_session`,
  `taxi_locale`, `@taxi-gps/*` packages, service names, bot username)
  are unchanged.

### Fixed

- Telegram persistence failures are classified correctly instead of
  surfacing as generic errors.
- Telegram preference saves are independent per account and protected
  against stale overwrites.
- Production preflight build dependency, public readiness forwarding,
  movement-history acceptance status, administration users loading warning,
  duplicate Account live regions, and lost unexpected login failures.
- Vehicle trips shell is preserved on context failure instead of
  unmounting the workspace.

## [1.0.0] - 2026-08-23

Immutable baseline release: authenticated fleet monitoring with GPS
synchronization, position history, trips, events, reports, GPS history
administration, and global product Telegram delivery.
