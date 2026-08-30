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

The current design-direction stage is documentation-only and is defined in
[`docs/frontend-design-direction.md`](./frontend-design-direction.md). It
audits the completed feature set, selects the target shell and UX system, and
preserves API and business behavior.

**DONE — Slice 1: shadcn foundation + application shell.** The Web application
now uses shadcn/ui as its preferred generic UI layer, with Base UI-backed
components, the Mira style, semantic tokens, responsive Sidebar/Sheet
navigation, and a compact authenticated top bar. Legacy Radix remains only for
the untouched dialog consumer while dependent screen migrations are pending.
This was presentation-only: no API, schema, migration, provider, scheduler, or
Telegram behavior changed.

**DONE — Slice 2: Fleet overview redesign.** Fleet is now a compact Mira
operational screen: a shadcn/Base UI toolbar and dense table on desktop, a
deliberate compact list on mobile, local presentation-only ordering, and
contract-backed status/freshness display. Existing server filtering,
authorization, timezone, refresh, route, provider-disabled, and scheduler
behavior remain intact. The response has no open-alert or selected-map handoff
field, so those remain on their existing screens pending a separately reviewed
data-contract decision. This was presentation-only: no API, schema, migration,
provider, scheduler, or Telegram behavior changed. A focused visual
composition remediation has subsequently consolidated the page into one
operational workspace and is awaiting renewed human visual acceptance.

**NEXT SUBSTAGE — Slice 3: Map / fleet-map interaction redesign.** Redesign
the Map workspace and its Fleet handoff inside the accepted shell only after
that renewed Fleet visual acceptance. The overall frontend design direction
remains **NOW** until all implementation slices and authenticated acceptance
are complete; it is not marked DONE here.

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
