# GPS history retention (Stages 19A–19C)

The Stage 19A planner remains a factual, mutation-free `GET /api/system/position-history/retention-plan` available with effective `historyAdmin.view`. It derives the latest already-occurred Tuesday 02:00 UTC anchor through the unchanged Stage 18C policy function and subtracts exactly 90 elapsed 24-hour days. The history page `?to=` value does not affect the retention anchor, cutoff, or days. Nest and Next responses are `Cache-Control: no-store`; query policy overrides are rejected.

Observation policy eligibility is strictly `observedAt < policyCutoff`. An observation exactly at the cutoff is protected. Stage 14 checkpoint targets remain closed/inclusive `[rangeFrom, rangeTo]` intervals:

- `FULLY_OBSOLETE`: `rangeTo < policyCutoff`.
- `BOUNDARY_OVERLAP`: `rangeFrom < policyCutoff` and `rangeTo >= policyCutoff`.
- `PROTECTED`: `rangeFrom >= policyCutoff`.

A checkpoint ending exactly at the cutoff is boundary-overlapping, while one starting exactly at the cutoff is protected. Range class—not `PENDING`, `RUNNING`, or `COMPLETED` status—controls retention eligibility.

The planner additionally reports `executableObservationCandidates`: old observations not inclusively covered by any checkpoint that would survive retention. Coverage requires the same vehicle and `rangeFrom <= observedAt <= rangeTo`. Thus an old observation covered by a boundary-overlap range stays protected. The candidate count describes eventual executable work after obsolete checkpoint cleanup; it is not a promise that the next bounded POST will delete every candidate. `destructiveExecutionApproved` remains `false`; browser data is never the security authority.

## Manual execution

Stage 19B adds one synchronous ADMIN-only confirmation POST. `historyAdmin.populate` does not grant deletion authority, and no new permission exists. The strict body contains only `expectedCanonicalAnchor` and `expectedPolicyCutoff`. After acquiring the existing global session advisory lock `1706170003`, the server checks for `PENDING`/`RUNNING` durable population, recomputes current policy, and returns 409 with zero deletion for a busy lock, active durable run, or stale confirmation. The server-computed matching policy is frozen for that invocation.

Deletion is checkpoint truth first, observation data second:

1. Remove `FULLY_OBSOLETE` checkpoints in short, committed, set-based batches, up to 5,000 per explicit invocation.
2. Recount obsolete checkpoints. If any remain, stop with zero observation deletion.
3. Only after the obsolete checkpoint count reaches zero, remove old observations not covered by any surviving boundary/protected checkpoint, in short batches up to 25,000.
4. Return deleted and remaining counts plus the factual budget-stop state.

This ordering makes partial crashes safe. A crash may leave obsolete checkpoint truth removed while observations remain, allowing a future wider backfill to recreate checkpoint truth and use existing observation deduplication. Retention never creates the unsafe inverse state where an observation is gone but surviving checkpoint truth still claims its range is populated. Boundary-overlap and protected checkpoints are never deleted. This preserves future 90-to-365-day repopulation safety.

The Next BFF reuses centralized same-origin write protection, forwards only the existing `taxi_session` through the shared helper, and never automatically retries a destructive POST. The ADMIN UI requires a separate confirmation displaying the exact planner snapshot, work counts, irreversible ordering, boundary protection, and fixed 5,000/25,000 limits. USERs retain planner visibility but see no cleanup controls. When there is no work, ADMIN sees a no-work state rather than an enabled destructive action.

## Automatic maintenance

Stage 19C adds one operational opt-in: `POSITION_HISTORY_RETENTION_ENABLED`. Missing or `false` means automatic deletion is disabled before planning or lock acquisition; `true` permits one scheduled evaluation daily at exactly **06:00 UTC**. The timezone is explicit and independent of the server's local timezone. There is no startup invocation or missed-run catch-up.

The retention flag is independent from `POSITION_HISTORY_MAINTENANCE_ENABLED`, which continues to control only Stage 18C automatic population at 03:00 UTC. Either feature can be enabled without the other. The Stage 19A planner and Stage 19B manual ADMIN cleanup remain available regardless of the automatic-retention flag; `historyAdmin.populate` still does not authorize deletion.

Each 06:00 invocation performs at most one bounded pass through the same Stage 19B destructive core. A read-only planner precheck may avoid an unnecessary mutation lock, but it is never deletion authority. Under the existing shared advisory lock `1706170003`, the service checks for any USER or SYSTEM `PENDING`/`RUNNING` durable population, recomputes the fresh server-owned canonical anchor and 90-absolute-day cutoff, then uses the unchanged checkpoint-first algorithm and fixed limits of 5,000 checkpoints and 25,000 observations. The lock, active-population guard, inclusive surviving-checkpoint protection, boundary semantics, and partial-commit safety are identical to manual execution.

An active population or unavailable lock is a benign skip. If `stoppedByBudget` is true, remaining work waits for the next normal daily schedule. Unexpected failure is contained at the cron boundary with no immediate retry, compensating restore, follow-up timer, or same-day continuation. Multiple API instances rely only on the existing shared lock; there is no leader election or second advisory key.

Automatic execution has no browser confirmation because it accepts no browser policy fields and computes fresh policy under the lock. It adds no public run-now API, CLI trigger, UI setting/control/history, durable retention job/table, scheduler state, custom cutoff/days/budget, 365-day setting, provider dependency/request, archive, VACUUM, partitioning, schema change, or migration. Manual ADMIN retention remains unchanged and available when automatic retention is disabled.
