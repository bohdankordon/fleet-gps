# Lossless position-history ingestion

## Product invariant

For every provider-mapped vehicle, Fleet GPS must eventually persist every unique, structurally valid normalized GPS fix that remains obtainable through the historical provider API, regardless of live polling interval, temporary failures, restart, or short downtime.

The v1.1.0 system did not provide that invariant. PR 3 adds a default-off continuous lane, PR 4A adds replay-generation durability, PR 4B activates fair recurring replay behind the same default-off feature, and PR 5 integrates those correctness facts with retention. PR 6A removes the rollout-assessment capacity blocker without changing those correctness semantics, and PR 6B with PR 6C resolves the operational-observability blockers the same way. Controlled rollout readiness assessment #3 returned GO FOR CONTROLLED ROLLOUT; the rollout itself has not been executed and stays intentionally deferred while further product features are developed.

## Two independent lanes

The live lane remains responsible for fresh current state and low-latency observations. The independent history lane retrieves historical ranges at least once and persists them idempotently. Live polling frequency is therefore not a completeness boundary.

Both lanes write `VehiclePositionObservation`. The stable `fixFingerprint` and unique `(vehicleId, fixFingerprint)` constraint deduplicate a fix first seen by `FLEET_SYNC` and later returned by `HISTORICAL_BACKFILL`; ingestion source and fetch time are not part of fix identity.

PR 3 adds an automatic poller and provider-read behavior only when `POSITION_HISTORY_CONTINUOUS_INGESTION_ENABLED=true`. The strict default is `false`; repository development, test, acceptance, and production examples do not enable it.

## Default-off continuous reconciliation

When enabled, `PositionHistoryContinuousIngestionModule` schedules a zero-delay asynchronous first cycle after application bootstrap and a lightweight 10.5-second eligibility poll thereafter. Each cycle has at most five logical provider-start opportunities, allowing up to five two-second-spaced starts before yielding. Bootstrap and readiness never await backlog completion. Missing cursors are conservatively ensured from the trusted cycle clock through the shared 90-day policy-floor helper, so restart or downtime naturally leaves `confirmedThrough < safeNow` and requires no ADMIN or browser action.

The worker has two bounded logical lanes:

- **Recent tail** fetches the closed 15-minute interval `[safeNow - 15m, safeNow]` when a vehicle's cursor is older than that interval. It inserts/deduplicates observations but never advances `confirmedThrough`.
- **Contiguous backlog** advances oldest-first from the durable cursor. A normal quantum advances at most 5 hours 45 minutes and fetches up to 15 minutes behind the old cursor: `fetchFrom = max(coverageFrom, confirmedThrough - 15m)` and `fetchTo = nextConfirmedThrough = min(confirmedThrough + 5h45m, safeNow)`. The resulting request is at most six hours. If the response hits the typed 10,000-row density guard, the worker retries from the same durable start with 3-hour/2h45m and then 1-hour/45m fetch/progress pairs. Rejected wider intervals never advance the cursor. Only this lane calls the atomic insert-plus-CAS operation.

Under the shared lock, both continuous lanes re-evaluate the active floor before a request. Recent-tail start is clamped to the greater of the cursor floor and current canonical policy floor. Backlog yields without provider traffic if its durable `coverageFrom` still trails a newly advanced canonical cutoff, allowing retention to perform the explicit floor transition first; after that transition, overlap is clamped to the refreshed `coverageFrom`.

`safeNow` is the injected trusted application clock minus two minutes. A cursor at or beyond it has no immediate backlog work and becomes eligible again after the initial five-minute caught-up cadence. If the cursor is already within the recent-tail interval, only contiguous work runs, avoiding two requests for equivalent coverage.

The former fixed two-continuous/one-daily/one-rolling shape left most of the 30-start/minute safety budget idle and reduced initial-backlog progress to roughly two requests/minute. PR 6A uses a small process-local deficit/deadline allocator instead. Recent-tail demand is protected at up to 20 starts/minute, while due daily and rolling work accrue two and four starts/minute respectively; overdue generations accelerate to three and five starts/minute. Any unused opportunity immediately flows to contiguous backlog, and backlog consumes all capacity when replay is not due. Durable cursors and replay checkpoints—not allocator counters—remain correctness truth, so restart may change order but cannot lose or fabricate work.

The five opportunities every 10.5 seconds approach 30 starts/minute without exceeding the unchanged two-second cross-replica pacing fence. These are logical opportunities: retries and adaptive attempts also pass through the same pacer, and rate-limit or lock outcomes stop lower-priority work for that cycle. Recent work remains ordered by oldest process-local success and vehicle ID; backlog remains ordered by oldest `confirmedThrough` and vehicle ID.

Every automatic provider attempt, including retries inside the reusable core, passes through the shared request-start pacing contract. Continuous, replay, and automatic durable population hold the PostgreSQL history advisory lock (`1706170003`) through their provider/persistence quantum and until two seconds after the latest request start. The lock excludes concurrent requests, while cooling before release carries the minimum spacing fence across API replicas; separate processes therefore cannot multiply the intended 30 request starts per minute. Lock unavailability yields without provider work.

Durable population now owns the lock for at most one existing 24-window chunk per poll invocation. Checkpoint and aggregate accounting commit as before, then an incomplete run returns to `PENDING` through an owner- and live-lease-conditional yield and the invocation returns. A later poll reclaims the same run from persisted truth. `startedAt`, committed-window accounting, finite checkpoint identity, budget, success, and failure semantics remain unchanged; an expired or replaced owner cannot commit, yield, or finalize. This creates genuine lock-acquisition opportunities between chunks without preempting a provider request already in flight.

Transient/provider failures retain eligibility without moving the cursor. Outer process-local backoff is 1, 2, 4, 8, 16, then 30 minutes; exhausted 429 also cools the fleet before another cycle starts provider work. Stable 4xx responses are treated as provider-blocked for an initial six-hour diagnostic cadence, with no response body persistence. Locally provider-disabled mapped vehicles still get conservative cursors, skip the recent lane, and receive only a six-hour contiguous diagnostic opportunity; successful history may advance normally, while HTTP 400 does not. These are operational policies, not provider contracts.

The poller prevents overlapping cycles in one process, removes startup/interval timers during shutdown, starts no new work after shutdown begins, and waits for its bounded in-flight cycle. Its internal status exposes aggregate cycle, lane, request, insertion, duplicate, invalid, retry, rate-limit, cursor-advancement, provider-blocked, failure, and lock-yield counts without coordinates, provider IDs, payloads, or credentials. No Admin UI is added.

## Reusable historical-window core

All historical-endpoint callers share one provider/transformation pipeline:

```text
provider historical request
→ reusable historical-window core
→ immutable normalized candidate result
→ caller-owned persistence and progress
```

The core accepts one positive external device ID and one finite, non-empty fetch range. It defensively limits an automatic request window to six hours, supported by controlled whole-vs-partition provider observations at 1, 6, and 24 hours; six hours is the initial operational choice, not a provider SLA. The existing finite/manual backfill still accepts targets up to seven days and deliberately partitions them into its established one-hour windows. No automatic 24-hour request is used.

For each invocation the core performs the provider request, bounded transient retry, whole-response device/range/10,000-row validation, provider-row mapping, normalization, and invalid-row accounting. It returns fetch boundaries, the successful attempt's `fetchedAt`, provider row count, normalized `PositionHistoryCandidate` values, skipped-invalid count, request count, retry count, and rate-limit-response count. Raw provider rows, response bodies, credentials, checkpoint state, and cursor state are not returned.

The 10,000-row guard belongs to the reusable core and remains unchanged. Oversized responses expose a safe typed outcome without raw rows or payloads so only continuous backlog and replay orchestration may retry deterministically at `6h → 3h → 1h`. The rejected interval is never persisted or marked complete; an oversized one-hour response remains a hard safe failure. Timeout, network, 429, 5xx, malformed/schema, generic contract, and database failures do not trigger subdivision. Fetch boundaries are inclusive. A usable timestamp outside them or a mismatched device fails the whole window; rows that cannot produce a usable timestamp continue to count as skipped invalid candidates, preserving the established behavior.

Retry delay and successful-window pacing have different owners. The core owns at most three attempts for network, timeout, HTTP 429, and HTTP 5xx failures. It honors `Retry-After` up to 60 seconds and otherwise sleeps for one second then two seconds. Stable HTTP 4xx and provider/schema contract failures are not retried. The finite backfill caller separately retains 500 ms pacing before an explicitly requested first window and between successful windows. Continuous orchestration owns its fleet-wide request-start budget.

The existing finite backfill now consumes this same core. Its checkpoint identity, resume/completion behavior, durable accounting, `maxWindows`, persistence transaction, aggregate result, and range ordering remain unchanged.

## Durable completeness cursor

Each vehicle may have exactly one `VehicleHistoryIngestionCursor`:

- `coverageFrom` is the earliest instant covered by the active Fleet GPS local completeness guarantee.
- `confirmedThrough` is the greatest contiguous historical boundary successfully processed under the active historical-finality policy.
- The database enforces `coverageFrom <= confirmedThrough` and finite timestamps.

`confirmedThrough` is not a claim that the provider can never publish a correction behind that boundary. Recurring replay generations cover that correction surface as described below. Provider finality is policy, not an immutable database fact.

The cursor uses a restrictive vehicle foreign key. Vehicle deletion therefore cannot silently erase a completeness claim and create historical ambiguity. Provider-disabled mapped vehicles are not excluded from cursor existence.

## Conservative bootstrap

Missing cursors are created idempotently at the current canonical local retention-policy floor, with:

```text
coverageFrom = confirmedThrough = policy floor
```

The floor shares the existing 90-day retention policy calculation. Bootstrap never derives completeness from the latest observation, current state, fetched time, vehicle creation time, provider latest position, or a non-contiguous set of bounded backfill checkpoints. Re-fetching duplicates is safe; false completeness is not.

The same ensure path is used by the continuous worker for existing, newly discovered, active, or provider-disabled mapped vehicles. No browser action or live-fleet-sync coupling is required.

## Fetch range is not progress range

A future reconciliation request may fetch overlap behind the cursor:

```text
fetchFrom = old confirmedThrough - replay overlap
fetchTo = safeNow
```

while its correctness transition is only:

```text
expectedConfirmedThrough = old confirmedThrough
nextConfirmedThrough = safeNow
```

Candidates earlier than `expectedConfirmedThrough` are valid overlap and must not be rejected by persistence. The historical-window core validates only `fetchFrom <= candidate.observedAt <= fetchTo`; it has no `coverageFrom`, `expectedConfirmedThrough`, or `nextConfirmedThrough` input. The future caller remains responsible for deciding whether a successful result is safe to persist and advance. The persistence layer does not make provider-finality decisions.

## Atomic persistence and CAS fence

One PostgreSQL transaction performs:

1. `VehiclePositionObservation.createMany(..., skipDuplicates: true)` for validated normalized candidates;
2. a conditional cursor update matching `vehicleId`, the expected `coverageFrom`, and the expected `confirmedThrough`; and
3. the transition to `nextConfirmedThrough`.

The conditional update must affect exactly one row. Otherwise a stale-progress error aborts the transaction, rolling back newly inserted observations. Empty candidate sets may still advance after a future caller has established that an empty historical response authoritatively covers the interval.

The dual-boundary CAS is the per-vehicle correctness fence. Retention can advance `coverageFrom` while leaving `confirmedThrough` unchanged, so a pre-retention plan cannot commit merely because its old confirmed boundary still matches. Any change to either expected correctness boundary makes the update stale and rolls back candidate inserts. Orchestration and the existing shared history coordination domain remain separate; this foundation adds no per-vehicle advisory lock.

## Durable replay generations

Finite backfill checkpoints cannot represent recurring replay. Their unique identity is `(vehicleId, rangeFrom, rangeTo)`, and `COMPLETED` truthfully means that finite target has been processed. A weekly-shifted 90-day horizon reuses 11 completed seven-day finite targets, which would suppress roughly 77 days that a new replay generation must intentionally fetch again. Existing finite checkpoints therefore remain unchanged and are never reset or reinterpreted.

PR 4A introduced two generation-scoped structures, now consumed by PR 4B orchestration:

- `PositionHistoryReplayRun` identifies one immutable `DAILY_7_DAY` or `ROLLING_90_DAY` generation by unique `(kind, generationAnchor)` plus its captured `rangeFrom` and `rangeTo`. A repeated ensure with different boundaries fails rather than changing an existing generation.
- `PositionHistoryReplayCheckpoint` records one vehicle/range obligation within a run. Its identity is `(runId, vehicleId, rangeFrom, rangeTo)`, so two generations may intentionally contain the same absolute range without sharing completion state. `nextFrom` supports bounded restart-safe progress and is constrained to the checkpoint range.

Replay runs are unowned and retryable while `PENDING`, exclusively leased while `RUNNING`, and become `COMPLETED` only when at least one checkpoint exists and all generation checkpoints are satisfied. A checkpoint interval is satisfied either by successful provider processing while it remains in the active policy domain or by explicit policy retirement after it ages out of that domain. Ownership-conditional claim, heartbeat renewal, yield, and completion transitions make execution restart-safe and multi-replica safe.

One replay persistence transaction inserts normalized observations with the established fingerprint uniqueness and conditionally advances the owned generation checkpoint by expected-`nextFrom` CAS. Empty candidate sets may advance replay progress. Stale progress, stale/expired ownership, or database failure rolls back inserted observations and progress together.

Replay state never reads or updates `VehicleHistoryIngestionCursor`. A completed replay generation proves only that every checkpoint in that generation was processed; it does not advance `confirmedThrough` or `coverageFrom` and does not prove contiguous completeness.

At each enabled poll, generation targets use `safeNow` and canonical UTC anchors. `DAILY_7_DAY` uses the latest 02:00 UTC boundary not after `safeNow` and captures exactly the preceding seven absolute days. `ROLLING_90_DAY` reuses the latest Tuesday 02:00 UTC maintenance anchor and captures exactly the preceding 90 absolute days. The daily generation has one seven-day checkpoint per eligible vehicle. The rolling generation uses the established chronological horizon partition: one oldest six-day checkpoint plus twelve seven-day checkpoints per vehicle. Provider requests advance through either checkpoint in adaptive inclusive windows of 6, 3, or 1 hour, with every successful advancement protected by the existing replay-checkpoint CAS. Replay never advances completeness cursors.

Generation membership is a finite snapshot of mapped, currently provider-enabled vehicles when checkpoints are first initialized. Initialization is all-or-nothing and idempotent under the shared history lock; once any checkpoints exist, normal fleet changes do not mutate that generation. A newly mapped or re-enabled vehicle joins later generations and remains covered by continuous catch-up in the meantime. Provider-disabled vehicles retain their cursor and are not marked complete, deleted, or repeatedly hammered; replay-generation completion speaks only for the readable membership captured for that generation.

Every successful replay window atomically inserts/deduplicates normalized observations and advances only its generation checkpoint by expected-`nextFrom` CAS. A successful empty window may advance. Provider, contract, storage, stale-lease, or stale-progress failure leaves replay progress incomplete and retryable. Stable unexpected 4xx failures use a six-hour process-local diagnostic delay; other outer failures use the bounded one-to-thirty-minute policy. Restart may retry sooner, which is safe because durable checkpoint truth and observation uniqueness remain authoritative.

Generation anchors make repeated polls idempotent without suppressing future work. W1 and W2 may contain identical absolute vehicle/range slices, but their run-scoped checkpoint identities are different, so W2 intentionally fetches those slices again. Operational priority is recent tail, contiguous backlog, daily replay, then rolling replay. Explicit user/admin population remains available and fair because its lock ownership is bounded.

PR 4B and PR 6A add no schema or migration and introduce no second feature flag. Continuous and replay scheduling run only when `POSITION_HISTORY_CONTINUOUS_INGESTION_ENABLED=true`, whose default and production examples remain `false`.

## Retention and the active guarantee domain

The active local completeness guarantee is exactly the cursor interval `[coverageFrom, confirmedThrough]`; normal policy works toward `safeNow`, while the left edge follows the canonical approximately-90-day history policy. One retention execution captures one cutoff through the shared `positionHistoryPolicyFloor` helper and, under advisory lock `1706170003`, performs this safety ordering:

1. advance every older cursor floor with `coverageFrom = max(coverageFrom, cutoff)` and `confirmedThrough = max(confirmedThrough, coverageFrom)`;
2. policy-retire incomplete replay prefixes below the same cutoff;
3. run the unchanged finite-checkpoint-first, bounded observation deletion algorithm; and
4. release the shared lock.

The cursor/replay transition commits before deletion starts. If it fails, deletion does not begin. If a later deletion batch fails, the narrower guarantee is conservative and old rows may remain until retry. Neither boundary moves backward, and `confirmedThrough` moves because of retention only when it must catch the newly advanced guarantee floor. This is a policy-domain change—not provider retrieval, recovery, or finality evidence. The same rule applies to provider-disabled vehicles; their local guarantee floor advances even though they may remain blocked and behind `safeNow`. Retention does not create missing cursors.

For replay, retention advances an incomplete checkpoint to `min(max(nextFrom, cutoff), rangeTo)` without provider observations. A partially expired checkpoint continues later from its in-policy remainder. A fully expired checkpoint becomes satisfied, and the normal lease-fenced replay lifecycle completes its run once every checkpoint is satisfied. The replay worker independently applies the same canonical floor before each quantum, so it can settle obsolete work with zero provider request and can never intentionally re-fetch or reinsert an expired prefix. Replay policy retirement never reads or changes `coverageFrom` or `confirmedThrough`.

Finite `VehiclePositionBackfillCheckpoint` truth remains separate. Fully obsolete finite checkpoints are deleted first, and surviving inclusive finite ranges continue to conservatively protect covered old observations. No observation at or after the active cutoff is eligible for normal retention deletion. The shared advisory lock excludes retention from continuous recent/backlog, replay, durable population, and another retention execution; lock contention yields with no partial work.

## Provider discovery policy inputs

Controlled read-only discovery on 2026-09-13 observed a maximum near-now historical confirmation delay of 839 ms. Initial operational recommendations for later stages are:

- provider finality delay: 2 minutes;
- routine replay overlap: 15 minutes;
- caught-up reconciliation cadence: 5 minutes;
- fleet historical request budget: 30 requests/minute;
- minimum request-start pacing: 500 ms;
- daily replay: trailing 7 days;
- rolling full-horizon replay: 90 days, completed at least weekly; and
- local raw-history retention: approximately 90 days.

These values are observations and conservative operating policy, not provider contractual guarantees. Discovery also observed HTTP 400 for one disabled sample's historical reads; later orchestration must treat that state as unresolved and must not initialize such a vehicle as complete.

Daily trailing-seven-day and weekly rolling-90-day replay remain operational safeguards because no finite late-insertion or correction bound was established. With six-hour replay windows, planning models estimate combined steady-state demand of 12.76, 14.80, and 25.52 starts/minute for 50, 58, and 100 vehicles respectively. Those values are capacity estimates—not provider throughput guarantees or SLAs—and leave progressively less room for initial backlog and retries. Replay runs only behind the default-off history feature. PR 6A resolved the capacity blocker. PR 6B resolved the first observability blocker and PR 6C completed production-edge, replay-debt, and retention observability. Controlled rollout readiness assessment #3 returned GO FOR CONTROLLED ROLLOUT; the rollout itself has not been executed and stays intentionally deferred while further product features are developed.

## PR 6B operator status (ADMIN-only, read-only)

An authorized operator with `historyAdmin.view` can obtain the supported lossless-history health snapshot without SQL, source debugging, global verbose logging, or provider data:

```text
GET /api/system/position-history/ingestion-status
```

The route lives on the existing ADMIN-only `system/position-history` controller and requires the same `historyAdmin.view` authority as the horizon-status surface. Unauthenticated and authorized-without-permission callers are rejected; no new public or unauthenticated health surface was added. Reading status makes zero provider requests, performs zero DB mutations, creates no cursor, creates no replay generation, claims no lease, acquires no mutation advisory lock, and triggers no scheduler.

Both the supported Next.js production-edge response and the internal Nest response carry an explicit `Cache-Control: no-store` header (covered by HTTP tests); the BFF route additionally opts out of static rendering and cached fetching. Supported production-edge access is `GET /api/system/position-history/ingestion-status` through Next.js, which forwards the operator session to Nest through the established authenticated BFF mechanism and preserves `historyAdmin.view` authorization end to end; container login is not the supported operator method and the Nest service is not exposed directly through the edge.

The response is aggregate-only. It never exposes coordinates, raw positions, provider device IDs, vehicle names, fingerprints, raw error messages, stack traces, response bodies, credentials, tokens, advisory-lock owners, or replay lease owners.

Process-local telemetry (request rate, failure counters, retries, lock contention, provider-blocked streams, recent-tail activity, cycle timestamps) resets when the API process restarts; `processStartedAt` makes resets obvious. Durable truth (cursors, confirmedThrough, replay runs/checkpoints, durable population) survives restart. `currentSafeBoundary` is the single deterministic boundary (`now - 2 minutes`) used for all cursor-lag math in the response; observation MAX timestamps are never used as completeness.

- `configuration`: `continuousIngestionEnabled` (`POSITION_HISTORY_CONTINUOUS_INGESTION_ENABLED`), `automaticRetentionEnabled` (`POSITION_HISTORY_RETENTION_ENABLED`). Feature remains default-off.
- `runtime`: `pollerStarted`, `cycleInFlight`, `lastCycleStartedAt`, `lastCycleCompletedAt`, `processStartedAt`.
- `providerTraffic`: trailing-60s `requestStartsLastMinute` (actual shared-pacer request starts across continuous recent/backlog, daily/rolling replay, coordinated population, and retries) plus since-process-start totals for starts, PR 2 retries, 429s, 5xx, network, timeout, contract, storage, provider-blocked, and unknown.
- `coordination`: `historyLockContentionSinceProcessStart`, current `providerBlockedStreams` (process-local 6-hour stable-4xx cooldowns; resets on restart; cursor truth remains durable), and aggregate `durablePopulationActive`.
- `cursor`: `mappedVehicles`, `cursorCount`, `missingCursorCount`, `medianLagSeconds`, `worstLagSeconds`, `oldestConfirmedThrough`, and `currentSafeBoundary`, where `lag = max(0, safeBoundary - confirmedThrough)`.
- `recentTail`: process-local `lastSuccessAt`, successes, and failures. No durable recent completeness is invented.
- `replay.daily` / `replay.rolling`: current/latest generation anchor, `PENDING` / `RUNNING` / `COMPLETED` or truthful `NOT_CREATED`, checkpoint totals/completed/remaining, `progressPercent`, `isCurrent`, and simple `debtSuspected` (incomplete generation older than the current anchor), plus cross-generation debt aggregates `incompleteGenerations`, `overdueIncompleteGenerations`, `oldestIncompleteGenerationAnchor`, `oldestOverdueGenerationAnchor`, and `hasReplayDebt`, so an older incomplete generation cannot be hidden by a newer current generation. A generation is overdue only when a newer canonical daily/weekly boundary has become due; a still-processing current generation alone is not debt. No checkpoint enumeration and no generation creation on read.
- `retention`: `enabled`, process-local runtime (`running`, `lastAttemptAt`, `lastCompletedAt`, `lastOutcome` of `NOT_OBSERVED_THIS_PROCESS` / `SUCCESS` / `SKIPPED` / `FAILED`, safe `lastSkipCategory` of `LOCK_UNAVAILABLE` / `ACTIVE_POPULATION`), `nextScheduledExecutionAt` (daily 06:00 UTC, null when disabled), durable `currentRetentionPolicyFloor` with `cursorsBehindRetentionFloor` / `cursorsAtOrBeyondRetentionFloor` / `retentionFloorAligned` derived from cursor `coverageFrom` only. Process-local execution history resets on API restart; report `NOT_OBSERVED_THIS_PROCESS` after restart until a new automatic execution is observed rather than claiming no historical run ever occurred.
- `meta`: explicit process-local vs durable scope note.

Production safety: `POSITION_HISTORY_CONTINUOUS_INGESTION_ENABLED=true` requires automatic retention (`POSITION_HISTORY_RETENTION_ENABLED=true`). The compiled API production configuration check rejects `continuous=true` with `retention=false` by variable names only. Valid combinations are false/false, false/true, and true/true; only true/false is invalid for rollout.

GREEN (bootstrap trending healthy): request rate at or below 30/min, cursor median/worst lag trending downward, recent-tail successes continuing, no sustained growth in 429/5xx/timeout counters, daily/rolling remaining counts declining, and lock contention bounded.

ROLLBACK (stop and investigate): health/readiness degradation, request rate above 30/min, sustained 429/5xx/timeouts, cursor lag flat or worsening while requests continue, replay debt increasing (`hasReplayDebt` true or growing remaining), retention floors misaligned while retention is enabled, or abnormal lock contention.

Monitoring integration was intentionally not forced in PR 6B; operators consume the ADMIN status above manually during the controlled rollout. No Admin UI redesign was made and no migration was added. PR 6C keeps that scope: production-edge BFF route, replay-debt aggregates, and automatic-retention observability only.
## PR 6C complete rollout observability (production edge, debt, retention)

PR 6C closes the four remaining assessment #2 blockers without touching ingestion correctness, pacing, capacity, retries, locking, cursor/replay/retention execution semantics, or the database schema.

### Supported production-edge route

Production topology exposes Caddy to Next.js only, so the Nest route is not directly reachable. The supported operator path mirrors the existing authenticated BFF pattern (same shape as the horizon-status and durable-run BFF routes):

    GET /api/system/position-history/ingestion-status

The Next route is force-dynamic with revalidate 0, forwards the operator session cookie to the internal Nest route through the established authenticated fetch mechanism with a no-store upstream fetch, validates the payload against a strict aggregate contract, preserves safe auth semantics (unauthenticated to 401, unauthorized to 403, contract mismatch to 502, transport failure to 503), and always responds with Cache-Control no-store. It makes zero provider calls and zero DB writes and duplicates no ingestion logic. Nest remains authoritative for historyAdmin.view; no client-supplied role or permission header is trusted.

### Real no-store contract

Assessment #2 correctly found the PR 6B docs showed no-store while neither implementation set it. Both surfaces now set the header explicitly and HTTP tests assert the actual header value. Repeated reads reflect live fake runtime telemetry rather than a cached payload (covered by tests). No global caching behavior was changed for unrelated routes.
### Replay debt semantics

Newest-generation-only status could hide an older incomplete generation behind a current one. Each replay summary now also exposes incompleteGenerations, overdueIncompleteGenerations, oldestIncompleteGenerationAnchor, oldestOverdueGenerationAnchor, and hasReplayDebt, derived from bounded replay-run metadata queries (aggregate count plus oldest matching runs, no checkpoint or observation loading, no N+1 by vehicle). A generation is overdue only when a newer canonical daily or weekly boundary has become due, using the same canonical anchor helpers as the scheduler; a still-processing current generation alone is not debt. Completed generations are never counted. Status reads never create or mutate replay state.

### Automatic retention status and first-day interpretation

Configuration alone cannot prove retention is operating. The retention object now reports enabled, process-local runtime (running, lastAttemptAt, lastCompletedAt, lastOutcome, safe lastSkipCategory), nextScheduledExecutionAt for the daily 06:00 UTC schedule (null when disabled), and durable currentRetentionPolicyFloor with cursorsBehindRetentionFloor, cursorsAtOrBeyondRetentionFloor, and retentionFloorAligned derived from cursor coverageFrom against the shared policy-floor helper (no observation scan; never aligned when no cursor rows exist).

Safe outcomes reuse existing execution semantics: scheduler ticks while disabled record nothing and stay NOT_OBSERVED_THIS_PROCESS, successful cycles (including no-work cycles) record SUCCESS, lock contention and active durable runs record SKIPPED with LOCK_UNAVAILABLE or ACTIVE_POPULATION, and unexpected failures record FAILED with no raw error content. Telemetry only observes execution; scheduling, locking, and retention behavior are unchanged.

First-day rollout answers with supported surfaces only: (1) retention configured on comes from retention.enabled; (2) an attempt observed in this process comes from lastOutcome differing from NOT_OBSERVED_THIS_PROCESS with lastAttemptAt set; (3) the latest safe outcome comes from lastOutcome and lastSkipCategory; (4) durable floor alignment comes from retentionFloorAligned with the behind and at-or-beyond counts; (5) the next expected execution comes from nextScheduledExecutionAt. After an API restart the runtime fields reset to NOT_OBSERVED_THIS_PROCESS until a new automatic execution is observed; the durable alignment counts remain available across restarts.

Feature remains default-off and production-disabled. No schema change and no migration were added; retention execution truth combines process-local scheduler telemetry with durable cursor alignment. Controlled rollout readiness assessment #3 returned GO FOR CONTROLLED ROLLOUT; the rollout itself has not been executed and stays intentionally deferred while further product features are developed.
