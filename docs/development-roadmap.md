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
- Accepted Telegram 2D production source: `e59268fe471d22426359bec419a9a03a244d2909` (`sha-e59268fe471d`).
- Immutable baseline release: `v1.0.0`.
- `v1.0.0` annotated tag object: `82fdee34c7eaff7a07fabd47e38fd6a32bbcc6c8`.
- `v1.0.0` peeled commit: `9bbd9b98c148b2ffed0078078d175d778c67f7ba`.
- `v1.0.0` and `v1.0.0-rc.4` remain immutable. Normal feature development continues from `main`.

## DONE — Post-release scheduled history soak

**SCHEDULED HISTORY SOAK ACCEPTED.** Four natural daily position-history maintenance SYSTEM runs were observed; all succeeded, each respected the configured 2,000-window budget, and together they advanced 8,000 windows. There was no overlap, stale lease, restart loop, or provider retry storm.

Natural retention also executed as SYSTEM work with the correct cutoff contract. It deleted one eligible historical observation, left no eligible rows, and showed no duplicate or stale execution. Production remained healthy, so this post-release gate is closed.

## DONE — Configurability & Magic Numbers Audit

The shared business settings audit is complete.

## DONE — Global Business Settings Foundation

The typed, global ADMIN business-settings foundation is complete: revision-protected updates, durable audit entries, post-commit detector context resets, minimal authenticated runtime timezone reads, and the safe read-only geofence UI are covered by API and Web tests.

## DONE — Trip / Stop Settings Migration

Trip and stop analytics now use typed, revision-protected global ADMIN policy settings, with the current policy applied when historical analytics and reports are recomputed.

## DONE — Telegram 2A — Connection & secure linking

Private-chat-only, self-service per-user Telegram linking is complete, including secure one-time links, transactional connection lifecycle, account recovery/disconnect UI, and ADMIN security disconnect. It does not deliver product alerts or notification preferences.

## DONE — Telegram 2B — User preferences & vehicle scope

Account-owned notification preferences, revision protection, and preference-only vehicle scope are complete. This stage does not implement alert sending or authorization changes.

## DONE — Telegram 2C — Recipient-aware delivery

Recipient planning and dispatch are complete behind independent default-off
planning and dispatch gates. Recipient sends are authorization-rechecked,
lease-safe, bounded, and at-least-once. The production transition from legacy
global delivery is recorded under Telegram 2D.

## DONE — Telegram 2D — Production bot cutover / legacy transition

**PER-USER TELEGRAM DELIVERY ACCEPTED IN PRODUCTION.** Production runs the
accepted `e59268fe471d22426359bec419a9a03a244d2909` source/image with alert
ingestion, secure product linking, recipient planning, and per-user dispatch
enabled. Legacy global product delivery is disabled. The dedicated product bot
is `fleet_signal_bot`, and the cutover boundary is
`2026-08-29T19:39:17.339Z`.

The intended initial account is connected at connection revision 1 with master
and SPEEDING notifications enabled, INACTIVITY disabled, ALL vehicle scope, and
preference revision 4. Three natural post-cutover SPEEDING deliveries were
accepted as SENT on their first attempts, with no duplicates, failed/stale
delivery, or post-cutover legacy outbox creation. Production remains healthy on
17 migrations. Detailed operational evidence remains in the focused technical
and Git history rather than this roadmap.

## DONE — Final configurability consistency remediation

The final reconciliation is complete: Category C and D remain zero, all
CC-1 through CC-5 consistency items are resolved, and no new settings,
environment values, or migrations were needed. The original magic-number
configurability requirement is complete. See
[`docs/magic-numbers-final-reconciliation.md`](./magic-numbers-final-reconciliation.md).

## NOW — Fresh frontend design direction

The old DeepSeek design experiment branches were intentionally retired without
being merged or selected for reuse. Future design work starts as a fresh
iteration from current `main`, not from either deleted branch.

The rejected shadcn/Base UI/Mira implementation has been retired and the
frontend has been reset logically to its pre-shadcn baseline without rewriting
history. Ant Design 6 migration and redesign is the new active direction,
defined in
[`docs/frontend-design-direction.md`](./frontend-design-direction.md), while
preserving API and business behavior.

**DONE / HUMAN ACCEPTED — Fleet redesign.** The human-selected Fleet interface is
accepted and closed on native Ant Design 6. Search, Sort, and Refresh remain
always visible;
optional filters are collapsed by default with an active-count indicator.
Reset remains mounted at the far right, disabled at defaults and enabled when
an optional filter is active. The operational Table uses clear linked vehicle
identity and a compact neutral disabled-vehicle indicator.

**DONE / HUMAN ACCEPTED — Shared Fleet GPS header.** The
shared shell now uses the Fleet GPS visible brand, a light horizontal desktop
header, five deterministic semantic primary links, Administration in-page Tabs,
stable compact locale/account controls, and native Drawer-based responsive
navigation.

**DONE / HUMAN ACCEPTED — Fleet visual reference/design system.** The accepted
Fleet screen is the canonical visual reference for subsequent redesign slices.
Each screen inherits its design language while adapting the system to its own
workflow rather than copying Fleet's exact layout.

**NOW — Frontend redesign.** Behavior-preserving redesign continues in small,
human-reviewed slices using the accepted Fleet design reference.

**DONE / HUMAN ACCEPTED — Map redesign.** The behavior-preserving Map redesign
applies the accepted Fleet design language,
groups existing summary facts, prioritizes the MapLibre work surface, adds
local loaded-vehicle search and compact legend access, and moves selected
vehicle information into a responsive contextual inspector. API, business,
database, freshness, event, geofence, authorization, route, refresh, timezone,
and localization semantics remain unchanged.

**DONE / HUMAN ACCEPTED — Vehicle Detail Overview.** The
shared vehicle-family header and permission-aware route Tabs now cover Overview,
Trips, and Movement History. Overview separates current position freshness,
connectivity, disabled state, daily statistics, active events, and the bounded
recent-event history using the accepted Fleet GPS design language.

**DONE / HUMAN ACCEPTED — Trips redesign.** Trips now uses the
accepted vehicle-family shell and a Period Trigger → Unified Summary → Analysis
Workspace flow without changing trip, stop, gap, distance, range, or
authorization semantics.

**DONE / HUMAN ACCEPTED — Movement History redesign.** Movement
History now follows Period Context → Unified Summary → large Map → contextual
selected-observation details. Exact/sampled boundaries, Kyiv civil time validation,
stored-point-only routes, authoritative sampled gaps, and quality semantics remain
unchanged. The temporal-profile experiment is **PARKED** on
`experiment/history-echarts-timeline` for possible future review and is not part of the
human-accepted implementation.

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
