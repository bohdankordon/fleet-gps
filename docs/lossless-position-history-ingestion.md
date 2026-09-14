# Lossless position-history ingestion

## Product invariant

For every provider-mapped vehicle, Fleet GPS must eventually persist every unique, structurally valid normalized GPS fix that remains obtainable through the historical provider API, regardless of live polling interval, temporary failures, restart, or short downtime.

The v1.1.0 system did not provide that invariant. PR 3 adds a default-off continuous lane, PR 4A adds replay-generation durability, PR 4B activates fair recurring replay behind the same default-off feature, and PR 5 integrates those correctness facts with retention. The implementation is correctness-complete for controlled rollout, but production enablement remains a separate explicit operation.

## Two independent lanes

The live lane remains responsible for fresh current state and low-latency observations. The independent history lane retrieves historical ranges at least once and persists them idempotently. Live polling frequency is therefore not a completeness boundary.

Both lanes write `VehiclePositionObservation`. The stable `fixFingerprint` and unique `(vehicleId, fixFingerprint)` constraint deduplicate a fix first seen by `FLEET_SYNC` and later returned by `HISTORICAL_BACKFILL`; ingestion source and fetch time are not part of fix identity.

PR 3 adds an automatic poller and provider-read behavior only when `POSITION_HISTORY_CONTINUOUS_INGESTION_ENABLED=true`. The strict default is `false`; repository development, test, acceptance, and production examples do not enable it.

## Default-off continuous reconciliation

When enabled, `PositionHistoryContinuousIngestionModule` schedules a zero-delay asynchronous first cycle after application bootstrap and a lightweight 30-second eligibility poll thereafter. Bootstrap and readiness never await backlog completion. Missing cursors are conservatively ensured from the trusted cycle clock through the shared 90-day policy-floor helper, so restart or downtime naturally leaves `confirmedThrough < safeNow` and requires no ADMIN or browser action.

The worker has two bounded logical lanes:

- **Recent tail** fetches the closed 15-minute interval `[safeNow - 15m, safeNow]` when a vehicle's cursor is older than that interval. It inserts/deduplicates observations but never advances `confirmedThrough`.
- **Contiguous backlog** advances oldest-first from the durable cursor. Each quantum advances at most 45 minutes and fetches up to 15 minutes behind the old cursor: `fetchFrom = max(coverageFrom, confirmedThrough - 15m)` and `fetchTo = nextConfirmedThrough = min(confirmedThrough + 45m, safeNow)`. The resulting provider request is therefore never longer than the historical core's one-hour maximum. Only this lane calls the atomic insert-plus-CAS operation.

Under the shared lock, both continuous lanes re-evaluate the active floor before a request. Recent-tail start is clamped to the greater of the cursor floor and current canonical policy floor. Backlog yields without provider traffic if its durable `coverageFrom` still trails a newly advanced canonical cutoff, allowing retention to perform the explicit floor transition first; after that transition, overlap is clamped to the refreshed `coverageFrom`.

`safeNow` is the injected trusted application clock minus two minutes. A cursor at or beyond it has no immediate backlog work and becomes eligible again after the initial five-minute caught-up cadence. If the cursor is already within the recent-tail interval, only contiguous work runs, avoiding two requests for equivalent coverage.

Each coordinated cycle first gives two provider-window opportunities to continuous work, ordered recent tail then contiguous backlog when both are due, and then gives one bounded opportunity each to daily and rolling replay. Recent work is ordered by oldest process-local success and vehicle ID; backlog is ordered by oldest `confirmedThrough` and vehicle ID. This preserves continuous priority and a nonzero share for every replay lane without allowing rolling replay to drain the lock. Process-local tail scheduling may repeat after restart, which is safe because persistence is idempotent and it cannot create false completeness.

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

The core accepts one positive external device ID and one finite, non-empty fetch range. It defensively limits a request window to one hour, the currently proven ordinary execution size. The existing finite backfill still accepts targets up to seven days, partitions them into one-hour windows, and calls the core for each window. Future adaptive or wider replay orchestration must partition before calling the core; adaptive subdivision and 24-hour automatic requests are not implemented.

For each invocation the core performs the provider request, bounded transient retry, whole-response device/range/10,000-row validation, provider-row mapping, normalization, and invalid-row accounting. It returns fetch boundaries, the successful attempt's `fetchedAt`, provider row count, normalized `PositionHistoryCandidate` values, skipped-invalid count, request count, retry count, and rate-limit-response count. Raw provider rows, response bodies, credentials, checkpoint state, and cursor state are not returned.

The 10,000-row guard belongs to the reusable core so every present and future caller fails safely on an oversized response. Fetch boundaries are inclusive. A usable timestamp outside them or a mismatched device fails the whole window; rows that cannot produce a usable timestamp continue to count as skipped invalid candidates, preserving the established behavior.

Retry delay and successful-window pacing have different owners. The core owns at most three attempts for network, timeout, HTTP 429, and HTTP 5xx failures. It honors `Retry-After` up to 60 seconds and otherwise sleeps for one second then two seconds. Stable HTTP 4xx and provider/schema contract failures are not retried. The finite backfill caller separately retains 500 ms pacing before an explicitly requested first window and between successful windows. Continuous orchestration owns its fleet-wide request-start budget.

The existing finite backfill now consumes this same core. Its checkpoint identity, resume/completion behavior, durable accounting, `maxWindows`, persistence transaction, aggregate result, and range ordering remain unchanged.

## Durable completeness cursor

Each vehicle may have exactly one `VehicleHistoryIngestionCursor`:

- `coverageFrom` is the earliest instant covered by the active Fleet GPS local completeness guarantee.
- `confirmedThrough` is the greatest contiguous historical boundary successfully processed under the active historical-finality policy.
- The database enforces `coverageFrom <= confirmedThrough` and finite timestamps.

`confirmedThrough` is not a claim that the provider can never publish a correction behind that boundary. Replay sweeps are part of the future strong lossless contract. Provider finality is policy, not an immutable database fact.

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

At each enabled poll, generation targets use `safeNow` and canonical UTC anchors. `DAILY_7_DAY` uses the latest 02:00 UTC boundary not after `safeNow` and captures exactly the preceding seven absolute days. `ROLLING_90_DAY` reuses the latest Tuesday 02:00 UTC maintenance anchor and captures exactly the preceding 90 absolute days. The daily generation has one seven-day checkpoint per eligible vehicle. The rolling generation uses the established chronological horizon partition: one oldest six-day checkpoint plus twelve seven-day checkpoints per vehicle. Provider requests advance through either checkpoint in inclusive windows no longer than one hour.

Generation membership is a finite snapshot of mapped, currently provider-enabled vehicles when checkpoints are first initialized. Initialization is all-or-nothing and idempotent under the shared history lock; once any checkpoints exist, normal fleet changes do not mutate that generation. A newly mapped or re-enabled vehicle joins later generations and remains covered by continuous catch-up in the meantime. Provider-disabled vehicles retain their cursor and are not marked complete, deleted, or repeatedly hammered; replay-generation completion speaks only for the readable membership captured for that generation.

Every successful replay window atomically inserts/deduplicates normalized observations and advances only its generation checkpoint by expected-`nextFrom` CAS. A successful empty window may advance. Provider, contract, storage, stale-lease, or stale-progress failure leaves replay progress incomplete and retryable. Stable unexpected 4xx failures use a six-hour process-local diagnostic delay; other outer failures use the bounded one-to-thirty-minute policy. Restart may retry sooner, which is safe because durable checkpoint truth and observation uniqueness remain authoritative.

Generation anchors make repeated polls idempotent without suppressing future work. W1 and W2 may contain identical absolute vehicle/range slices, but their run-scoped checkpoint identities are different, so W2 intentionally fetches those slices again. Operational priority is recent tail, contiguous backlog, daily replay, then rolling replay. Explicit user/admin population remains available and fair because its lock ownership is bounded.

PR 4B adds no schema or migration and introduces no second feature flag. Continuous and replay scheduling run only when `POSITION_HISTORY_CONTINUOUS_INGESTION_ENABLED=true`, whose default and production examples remain `false`.

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

Daily trailing-seven-day and weekly rolling-90-day replay remain operational safeguards because no finite late-insertion or correction bound was established. They run only behind the default-off history feature. After PR 5 the data-integrity implementation is ready for a controlled rollout assessment, but it is still not automatically or production-enabled.
