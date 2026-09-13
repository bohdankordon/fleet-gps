# Lossless position-history ingestion

## Product invariant

For every provider-mapped vehicle, Fleet GPS must eventually persist every unique, structurally valid normalized GPS fix that remains obtainable through the historical provider API, regardless of live polling interval, temporary failures, restart, or short downtime.

The v1.1.0 system did not provide that invariant. PR 3 adds a default-off continuous lane that materially advances it, but wider replay, durable-population fairness, retention integration, and production enablement remain incomplete.

## Two independent lanes

The live lane remains responsible for fresh current state and low-latency observations. The independent history lane retrieves historical ranges at least once and persists them idempotently. Live polling frequency is therefore not a completeness boundary.

Both lanes write `VehiclePositionObservation`. The stable `fixFingerprint` and unique `(vehicleId, fixFingerprint)` constraint deduplicate a fix first seen by `FLEET_SYNC` and later returned by `HISTORICAL_BACKFILL`; ingestion source and fetch time are not part of fix identity.

PR 3 adds an automatic poller and provider-read behavior only when `POSITION_HISTORY_CONTINUOUS_INGESTION_ENABLED=true`. The strict default is `false`; repository development, test, acceptance, and production examples do not enable it.

## Default-off continuous reconciliation

When enabled, `PositionHistoryContinuousIngestionModule` schedules a zero-delay asynchronous first cycle after application bootstrap and a lightweight 30-second eligibility poll thereafter. Bootstrap and readiness never await backlog completion. Missing cursors are conservatively ensured from the trusted cycle clock through the shared 90-day policy-floor helper, so restart or downtime naturally leaves `confirmedThrough < safeNow` and requires no ADMIN or browser action.

The worker has two bounded logical lanes:

- **Recent tail** fetches the closed 15-minute interval `[safeNow - 15m, safeNow]` when a vehicle's cursor is older than that interval. It inserts/deduplicates observations but never advances `confirmedThrough`.
- **Contiguous backlog** advances oldest-first from the durable cursor. Each quantum advances at most 45 minutes and fetches up to 15 minutes behind the old cursor: `fetchFrom = max(coverageFrom, confirmedThrough - 15m)` and `fetchTo = nextConfirmedThrough = min(confirmedThrough + 45m, safeNow)`. The resulting provider request is therefore never longer than the historical core's one-hour maximum. Only this lane calls the atomic insert-plus-CAS operation.

`safeNow` is the injected trusted application clock minus two minutes. A cursor at or beyond it has no immediate backlog work and becomes eligible again after the initial five-minute caught-up cadence. If the cursor is already within the recent-tail interval, only contiguous work runs, avoiding two requests for equivalent coverage.

Each cycle has four provider-window opportunities and alternates recent/backlog/recent/backlog while both are due. Recent work is ordered by oldest process-local success and vehicle ID; backlog is ordered by oldest `confirmedThrough` and vehicle ID. This reserves half the opportunities for overdue recent work, preserves a nonzero backlog share, and rotates rather than draining one vehicle fully. Process-local tail scheduling may repeat after restart, which is safe because persistence is idempotent and it cannot create false completeness.

Every provider attempt, including retries inside the reusable core, passes through the continuous worker's request-start gate. The worker holds the shared PostgreSQL history advisory lock (`1706170003`) for one provider/persistence quantum and until two seconds after its latest request start. This gives concurrency one and a conservative ceiling of 30 request starts per minute across cooperating continuous-worker replicas, while exceeding the required 500 ms minimum gap. Lock unavailability yields without provider work. Existing durable population currently holds this lock for long runs and may starve continuous work; PR 4 will introduce bounded quanta for that existing worker.

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
2. a conditional cursor update matching both `vehicleId` and the expected `confirmedThrough`; and
3. the transition to `nextConfirmedThrough`.

The conditional update must affect exactly one row. Otherwise a stale-progress error aborts the transaction, rolling back newly inserted observations. Empty candidate sets may still advance after a future caller has established that an empty historical response authoritatively covers the interval.

The CAS is the per-vehicle correctness fence. Orchestration and the existing shared history coordination domain remain separate; this foundation adds no per-vehicle advisory lock.

## Retention compatibility

The active local guarantee domain is approximately 90 days. A later retention integration can move `coverageFrom` forward to a newer cutoff and, when necessary, move `confirmedThrough` to that cutoff under the shared history lock. That narrows the explicit guarantee domain without claiming completeness for deleted history. PR 3 does not change retention execution; PR 5 must integrate retention and cursor boundaries before production enablement.

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

Daily trailing-seven-day and weekly rolling-90-day replay are still required because no finite late-insertion or correction bound was established; neither exists in PR 3. Together with the PR 4 durable-population fairness work and PR 5 retention integration, these are explicit reasons the default-off continuous lane is not yet production-ready or production-enabled.
