# Taxi GPS development roadmap

This document is the primary living record of the project's development direction, active work, deferred work, production follow-up, design experiments, and release readiness. It is a roadmap, not a historical changelog.

## Status model

- **DONE** — accepted and closed; retain only the evidence needed to understand the decision.
- **NOW** — the current development priority.
- **NEXT** — accepted into scope and expected after the current work.
- **LATER** — necessary work without a current schedule.
- **ONGOING** — an established operational process, not an open blocker.
- **PARKED** — intentionally paused while its context or dependencies stabilize.
- **BLOCKED** — accepted work that cannot proceed until a named blocker is resolved.

## Current state

- Canonical feature-development branch: `main`.
- Current `main` at this update: `31486806ce342c3fc9afb07e02818f14a2104d57`.
- Production release: `v1.0.0`.
- `v1.0.0` annotated tag object: `82fdee34c7eaff7a07fabd47e38fd6a32bbcc6c8`.
- `v1.0.0` peeled commit: `9bbd9b98c148b2ffed0078078d175d778c67f7ba`.
- `v1.0.0` is immutable. Normal feature development continues from `main`.

## DONE — Post-release scheduled history soak

**SCHEDULED HISTORY SOAK ACCEPTED.** Four natural daily position-history maintenance SYSTEM runs were observed; all succeeded, each respected the configured 2,000-window budget, and together they advanced 8,000 windows. There was no overlap, stale lease, restart loop, or provider retry storm.

Natural retention also executed as SYSTEM work with the correct cutoff contract. It deleted one eligible historical observation, left no eligible rows, and showed no duplicate or stale execution. Production remained healthy, so this post-release gate is closed.

## DONE — Configurability & Magic Numbers Audit

The shared business settings audit is complete.

## NOW — Global Business Settings Foundation — final remediation

Finish dedicated API, UI, detector-reset, and timezone-contract acceptance coverage before closing Settings 1A.

## NEXT — Trip / Stop Settings Migration

Move approved trip and stop policy constants into the same typed global-settings model.

## NEXT — Per-user Telegram Notifications

Design user-scoped Telegram notification preferences without reusing global Telegram settings.

## PARKED — Design direction experiments

Redesign work is intentionally paused while feature development continues. The following published experiment branches are preserved for later comparison and reference:

- `design/deepseek-frontend-rethink` — `92760a904343a65e93a4fceb5104912496633dbf`
- `design/deepseek-soft-ui-rethink` — `7515c5c935b1b1297800c29a228d186b8f125df4`

Neither experiment is merged into `main`, neither is accepted as the final direction, and no final design has been selected. Feature work should prioritize functional correctness rather than maintaining both experimental visual systems. After the important features stabilize, design work can resume and the selected direction should be adapted to the final feature set.

## LATER — Final production hardening

- Remove the temporary passwordless sudo configuration that remains intentionally available for continued development and operations.
- Do not remove it casually during unrelated development. Treat removal as a dedicated final hardening stage, then verify operational, systemd, backup, and recovery workflows.

## LATER — Next release readiness

No next release is currently scheduled. Before creating another immutable release tag:

- Finish the intended feature scope.
- Complete regression checks, typechecking, linting, tests, and builds.
- Review database migration impact if features introduce schema changes.
- Perform production preflight.
- Verify backup and restore readiness remain healthy.
- Perform a security and hardening review.
- Resolve the temporary passwordless sudo configuration.
- Select and finalize the product design direction.
- Perform authenticated desktop and mobile UI acceptance.
- Create an immutable release tag only after acceptance.

## ONGOING — Production operations

These are established operational processes, not open roadmap blockers:

- Natural position-history maintenance continues under its configured budget.
- History retention continues naturally.
- Monitoring and alerts remain enabled.
- Backup and disaster-recovery procedures already exist.
- Observe these processes normally; make them roadmap work only when a real failure or regression requires action.

Do not create recurring manual maintenance work to replace the natural schedulers.

## Development guardrails

- `main` is the canonical feature-development branch.
- Release tags are immutable.
- Production-changing work must be explicit and separately reviewed.
- Do not trigger accidental provider calls or position-history backfills.
- Never place production credentials or secrets in source or documentation.
- Keep design experiments isolated until a direction is intentionally selected.
- Preserve API and business behavior during presentation-only work.
- Make database migrations deliberate and review them before use.
- Keep development provider, history, scheduler, and Telegram background jobs disabled unless a specific local test explicitly requires them.

## Updating this roadmap

Update this document when:

- A new feature is accepted into scope.
- A roadmap item begins.
- An item is completed.
- A design or release decision changes.
- A production follow-up becomes necessary.

Keep completed low-level implementation details in Git history and focused technical documentation rather than allowing this roadmap to grow indefinitely.
