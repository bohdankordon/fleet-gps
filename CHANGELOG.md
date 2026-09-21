# Changelog

All notable changes to Fleet GPS are documented here. Release versions are
immutable Git tags; package versions in `package.json` files are internal
workspace versions, not the product release version.

## [Unreleased] — v1.3.0 (Production Rollout Complete)

Controlled production rollout completed: continuous lossless GPS history
reconciliation, daily trailing-7-day and rolling 90-day replay, and automatic
bounded retention are active in production, with the maintenance accelerator
intentionally disabled in steady state.

### Added

- Vehicle groups with curated display colors and scoped Product Vehicle
  Access for USER accounts.
- Password policy with a local common-password blocklist, and forced
  temporary-password onboarding for new and reset accounts.
- Speeding investigation improvements: exact trip focus for speeding events,
  confirmed-episode route highlighting, and speeding episode evidence.
- Per-user Telegram product delivery as the active notification path, with
  legacy global delivery disabled.

### Changed

- ADMIN history overview now reads the lossless ingestion-status surface
  instead of observation-wide aggregates.
- Retention planning and execution are bounded (no exact pre/post candidate
  recounts) with budget-aware, retention-work-aware ADMIN UX.
- Telegram account-linking UX improvements.
- History ingestion telemetry wiring restored; Node 24 DNS lookup semantics
  supported by the host monitor (false-critical fix).

### Reliability and correctness

- Operational rollout and monitoring hardening: protected ingestion-status
  telemetry through the production BFF, production preflight checks, and
  host-level monitoring.
- No intentionally breaking public API change is part of this release.
- Publishing a GitHub Release does not deploy the application to production.

## [1.2.0] - 2026-09-14

Lossless GPS history ingestion and reconciliation. Continuous and replay ingestion remain default-off, have not been enabled in production, and the controlled rollout readiness assessment returned GO with the rollout itself intentionally deferred.

### Added

- Durable per-vehicle history completeness cursors with conservative bootstrap at the canonical retention-policy floor.
- Continuous historical reconciliation with restart catch-up across recent-tail and contiguous-backlog lanes.
- Daily 7-day and rolling 90-day replay generations with fair, work-conserving coordination.
- Protected operational ingestion-status surface through the Next.js BFF and the internal Nest API, exposing request-rate, failure, retry, lock-contention, provider-blocked, recent-tail, cursor-lag, replay-progress, replay-debt, and retention execution and alignment telemetry as safe aggregates.
- Replay debt and automatic retention execution and floor-alignment telemetry.
- Production preflight rule requiring automatic retention when continuous ingestion is enabled.

### Changed

- Historical provider work now uses fair, work-conserving coordination across continuous and replay lanes.
- Automatic history reads can use adaptive 6h to 3h to 1h windows around the 10,000-row density guard.
- Retention now advances the active completeness guarantee floor safely instead of leaving cursors behind a moved cutoff.
- Population work yields bounded quanta instead of monopolizing history coordination.

### Reliability and correctness

- Stable fingerprint dedupe keeps fleet sync and historical reads idempotent.
- Atomic cursor and replay compare-and-swap transitions roll back inserts on stale progress.
- Stale-plan protection rejects mismatched retention and replay targets.
- A cross-replica request-start pacing fence keeps automatic provider traffic within budget.
- Retention and replay reinsertion protection keeps expired prefixes from being refetched.
- Extensive isolated PostgreSQL regression validation with no development or production database contact.

### Operational status and upgrade notes

- Continuous and replay ingestion remain default-off and have NOT been enabled in production.
- Controlled rollout readiness assessment returned GO; the rollout itself is intentionally deferred while further product features are developed.
- Database migrations since v1.1.0 (history completeness cursors, replay generations) must be applied through the normal deployment procedure.
- Package versions remain 0.1.0.
- GitHub Release publication does not deploy production.

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
