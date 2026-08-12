# Vehicle position history

`VehiclePositionObservation` is the authoritative local PostgreSQL history of normalized GPS fixes. It is independent of alert evaluation and begins with forward ingestion in Stage 11B.1; the existing `AlertEvaluationObservation` journal is not copied or used as backfill.

## Forward ingestion

The ordinary fleet sync still fetches devices and latest positions once and uses one shared `fetchedAt` clock value. Its existing single-latest projection continues to update `VehicleCurrentState`. In parallel, every matched provider position row is normalized as a history candidate. Structurally usable coordinates and a valid fix timestamp are required; provider `valid=false` and `outdated=true` remain storable quality metadata. Missing, non-finite, or out-of-range coordinates and missing/invalid timestamps are skipped. Invalid or non-finite speed is stored as `null`; speed is never inferred from adjacent points.

Vehicle/current-state writes and one batched history `createMany` execute inside the same Prisma transaction. Expected unique conflicts use PostgreSQL `ON CONFLICT DO NOTHING` through `skipDuplicates`; any other history persistence failure rejects and rolls back the snapshot transaction. There is no per-position existence query.

History ingestion does not depend on `ALERT_INGESTION_ENABLED`. The fleet-to-alert bridge still runs only after the snapshot transaction commits and retains its previous behavior.

## Fix identity

The provider's normalized position contract has no stable immutable position ID and does not guarantee timestamp uniqueness. The internal `fixFingerprint` is SHA-256 over a versioned canonical binary representation of:

- `observedAt` as epoch milliseconds;
- latitude and longitude as canonical IEEE-754 doubles;
- nullable normalized `speedKph`.

Negative zero is canonicalized to zero. `vehicleId` participates in the database unique key, while ingestion source, `fetchedAt`, `valid`, and `outdated` are excluded from the fingerprint. Therefore fleet sync and future backfill deduplicate the same normalized fix, different vehicles remain independent, and distinct fixes at the same timestamp are preserved. The fingerprint and internal row ID are not public API fields.

Observations are immutable first-writer-wins records. A later duplicate does not overwrite the original quality, fetch time, or ingestion source; this keeps concurrent fleet/backfill races idempotent instead of turning them into last-write-wins metadata changes.

## Source and indexes

`PositionIngestionSource` contains `FLEET_SYNC` and `HISTORICAL_BACKFILL`. Stage 11B.1 writes only `FLEET_SYNC`; Stage 11B.2 may reuse the same normalization, fingerprint, table, and constraints for controlled official-provider backfill.

- Unique `(vehicleId, fixFingerprint)` is the concurrency-safe idempotency arbiter.
- `(vehicleId, observedAt, fixFingerprint)` supports future bounded chronological reads with a deterministic same-time tie-break.
- `(observedAt)` supports a future retention workflow.

No retention deletion or TTL is enforced. Thirty days remains only an earlier sizing candidate pending Stage 11B.2 density and provider-retention measurements. No startup cleanup, scheduled cleanup, historical `/positions` call, `routes-new` call, or track read API is part of Stage 11B.1.

## Historical provider discovery (Stage 11B.2)

Controlled read-only discovery established the official historical contract without writing provider results to PostgreSQL:

- `GET /positions?deviceId=<positive integer>&from=<absolute zoned ISO>&to=<absolute zoned ISO>` returns a JSON array ordered by `fixTime` ascending.
- Both `from` and `to` are inclusive. Equivalent UTC offsets return the same dataset. Observed wire timestamps contain three fractional-second digits.
- The response has no body cursor, page, total, or continuation metadata. A high-density 24-hour response and the union of four adjacent 6-hour responses had exactly the same 5,615 unique normalized fixes (zero missing or extra). No silent truncation was observed through 8,181 raw rows/day or a 16,105-row 30-day response.
- Every sampled raw row had a stable numeric provider `id`, and repeated ranges returned the same IDs. That ID is not used as the canonical local identity: one 24-hour response contained 8,181 distinct raw IDs but only 5,615 distinct normalized fixes. The existing versioned fingerprint therefore remains the cross-source dedupe key.
- The provider accepted windows through 30 days, but the sampled 30-day request took about 10.5 seconds. Backfill deliberately uses much smaller windows rather than treating the largest accepted provider range as an operational default.
- Five sampled vehicle-days contained 818, 896, 3,161, 4,729, and 8,181 raw rows (sample p50 3,161; sample p95/p99 8,181). Exact duplicate normalized fixes were common for some vehicles. Historical data was observed at 7, 30, 60, and 90 days ago for the controlled retention sample, so observed retention is at least 90 days; this is not a contractual provider guarantee for every vehicle.
- Provider `valid=false` occurs in real history and is retained when coordinates are structurally usable. No malformed coordinate was observed in the live sample, but application and database validation remain mandatory.
- Twenty-five sequential discovery requests at 350 ms pacing produced no 429, timeout, or provider error. This only establishes the observed result; it is not evidence of an unlimited rate.

The diagnostic runner is explicit and read-only:

```text
npm run position-history:discover -- --plan=narrow
npm run position-history:discover -- --plan=sample
npm run position-history:discover -- --plan=partition
```

It allows only official historical `/positions`, selects internal provider identity from local PostgreSQL without printing it, reports aggregates only, and verifies the history count did not change.

## Controlled resumable backfill

Backfill is an explicit operator command; it is not imported by `AppModule`, scheduler startup, fleet sync, a migration, or an HTTP endpoint:

```text
npm run position-history:backfill -- \
  --vehicle 00000000-0000-4000-8000-000000000000 \
  --from 2026-08-10T00:00:00Z \
  --to 2026-08-10T06:00:00Z
```

All three parameters are required. `vehicle` is the public vehicle UUID; `from` and `to` are absolute ISO instants with offsets and must define a non-empty interval no longer than seven days. A no-argument command cannot import anything.

An optional `--max-windows <1..168>` stops cleanly after that many committed windows. Re-running the same vehicle/range resumes from the durable cursor; this option is intended for bounded operator rollout and resumability checks, not as an in-memory checkpoint.

The provider interval and target interval are inclusive. A job is divided into sequential one-hour requests. Adjacent requests intentionally share their exact boundary because the provider includes both ends; database fingerprint dedupe removes that boundary replay without risking a sub-millisecond gap. Each response is guarded at 10,000 raw rows. The one-hour choice keeps a high-density sampled response near hundreds rather than thousands of rows and bounds one database transaction.

Requests have 500 ms inter-window pacing and no concurrency. A timeout, network failure, 5xx, or 429 receives at most three total attempts with conservative exponential delay. `Retry-After` is honored when it is parseable and no longer than 60 seconds; a longer requested pause stops the run with its checkpoint unchanged. Permanent 4xx and provider contract failures stop immediately.

`VehiclePositionBackfillCheckpoint` stores one target per `(vehicleId, rangeFrom, rangeTo)`, its next inclusive provider boundary, and `PENDING`, `RUNNING`, or `COMPLETED` status. The table contains no provider credentials or payload. For every successful window, one transaction performs `VehiclePositionObservation.createMany(skipDuplicates)` and conditionally advances the expected checkpoint cursor. A database failure rolls both operations back. A completed target returns without another provider request; a partial target resumes at the last committed boundary.

Historical rows use `HISTORICAL_BACKFILL`, the same knot-to-km/h mapping, absolute fix-time parser, coordinate/speed policy, SHA-256 fingerprint, table, and unique constraint as forward history. Existing `FLEET_SYNC` observations are immutable first-writer-wins duplicates. Structurally invalid coordinates or missing/invalid fix times are skipped, invalid speed becomes `null`, and usable `valid=false` / `outdated=true` quality is persisted.

The backfill Nest module imports only the database and official provider gateway. It cannot update `VehicleCurrentState`, run fleet sync, evaluate alerts, enqueue notifications, send Telegram, or call map/routing providers. Its CLI network guard permits historical `/positions` only.

Retention deletion remains disabled. The discovery supports a future capacity discussion using at least 90 observed provider days and highly variable density, but it does not establish a 30-day local deletion policy. A fleet-wide historical population and any cleanup scheduler remain separate operator/product decisions.

## Operator-only full-fleet backfill (Stage 13A)

The full-fleet command is an explicit operator orchestration layer over the same `PositionHistoryBackfillService` described above:

```text
npm run position-history:backfill-fleet -- \
  --from 2026-08-01T00:00:00Z \
  --to 2026-08-08T00:00:00Z \
  --max-vehicles 2 \
  --max-windows 2
```

`from` and `to` are required absolute ISO instants with explicit offsets. One invocation is a non-empty interval whose maximum is exactly seven absolute days. Longer population is performed as repeated, explicit target batches of at most seven days; Stage 13A does not add a 30/60/90-day target.

Vehicles are read from PostgreSQL and processed sequentially in public `Vehicle.id ASC` order, regardless of provider response order or vehicle name. Disabled persisted vehicles remain part of the full fleet. `--max-vehicles N` selects the first N vehicles of that deterministic order. Completed and unmapped vehicles consume a place in this prefix, so a tiny command cannot silently expand to later identities.

`--max-windows N` is one global work budget for the whole invocation, not a per-vehicle reset. It counts successfully committed provider windows. The orchestrator passes only the remaining allowance to the existing single-vehicle engine and stops after a partial vehicle when the allowance is exhausted. Provider retry attempts are reported separately and do not consume additional window-budget units. The option accepts any positive safe integer because a fleet can contain more than the single-vehicle maximum of 168 windows; each delegated vehicle target remains bounded to 168 windows by the existing engine. There is no vehicle fanout or `Promise.all`. The engine owns 500 ms request pacing, including the handoff between two active vehicles.

An exact completed `(vehicleId, rangeFrom, rangeTo)` checkpoint is skipped before delegation and produces zero provider requests. A partial exact checkpoint is delegated to the existing engine, which resumes at its committed inclusive `nextFrom` and does not request committed windows again. No fleet job table is required: the existing per-vehicle exact-target checkpoints are the durable resume state. Re-running an identical completed fleet target therefore performs zero historical provider requests.

Use `--plan` for a strictly read-only persisted-state report:

```text
npm run position-history:backfill-fleet -- \
  --from 2026-08-01T00:00:00Z \
  --to 2026-08-08T00:00:00Z \
  --max-vehicles 2 \
  --max-windows 2 \
  --plan
```

Plan mode does not call the single-vehicle engine, create checkpoints, write the database, or call the provider. Its safe aggregates include the deterministic vehicles considered, exact targets already completed, pending and partial targets, unmapped vehicles, and estimated remaining one-hour windows at invocation start. Output never includes public vehicle UUIDs, provider numeric IDs, coordinates, provider payloads, credentials, sessions, or tokens.

The only provider mapping is persisted `Vehicle.externalDeviceId`; `/devices` is never used by this command. A mapping is accepted only when it is a positive integer. An unsafe/missing mapping is counted as `unmappedVehicles`, receives no provider request, and remains incomplete; no ID is guessed. This is distinct from a mapped vehicle whose provider request fails. Any provider, provider-contract, or database failure from an active mapped vehicle propagates and stops the entire fleet invocation. Earlier committed vehicles/windows remain committed, the failed database transaction cannot advance its checkpoint, and no later vehicle is processed. There is no catch-and-continue coverage hole and no global rollback.

The aggregate result reports fleet counts, committed windows, provider requests/rows, candidates, inserted rows, duplicates, invalid rows, retry/rate-limit counts, and whether a work budget stopped the invocation. It contains no provider identity or position data.

This command remains outside `AppModule`. It has no scheduler, cron, timer, bootstrap hook, fleet-sync hook, dashboard integration, track/other GET side effect, migration execution, automatic full-fleet run, retention deletion, TTL, startup cleanup, or history replacement. Normal application startup never begins fleet historical backfill.

Stage 13B also adds the opt-in `--exclude-provider-disabled` flag to this fleet backfill command. It removes vehicles whose persisted `Vehicle.disabled` value is `true` from that invocation's eligible fleet and reports the excluded count. The flag is an operator selection mechanism only: it does not change checkpoint status, does not make `disabled` application business truth, and does not establish any causal relationship between disabled state and a provider HTTP response. Without the flag, provider-disabled vehicles remain eligible as before. The command does not call `/devices` to determine this state.

## Historical coverage audit (Stage 14A)

The operator coverage audit reports what local PostgreSQL history facts exist for one explicit absolute range:

```text
npm run position-history:coverage -- \
  --from 2026-08-10T02:00:00.000Z \
  --to 2026-08-11T02:00:00.000Z
```

Both arguments are required strict absolute ISO timestamps with an explicit `Z` or numeric offset. The interval must be non-empty and may span at most exactly seven absolute days. There is no environment-variable range and no 30/60/90-day audit mode. Observation boundaries are inclusive (`observedAt >= from` and `observedAt <= to`).

Checkpoint coverage and observation presence are deliberately independent report sections. Checkpoint coverage considers only the checkpoint whose persisted `rangeFrom` and `rangeTo` equal the normalized requested instants exactly. It reports `COMPLETED`, `RUNNING`, `PENDING`, and no-exact-checkpoint vehicle counts. Wider, narrower, or merely overlapping checkpoints do not contribute, so an unrelated older target cannot affect the requested target. A completed checkpoint records successful processing of that exact provider target; it does not promise that the provider returned a point in every hour or any point at all.

Observation presence independently reports total local rows, vehicles with and without rows, `FLEET_SYNC` and `HISTORICAL_BACKFILL` source counts, and nullable first/last `observedAt`. A vehicle can have observations without an exact checkpoint. The neutral checkpoint-by-observation cross-summary makes both combinations visible. It is not a completeness, health, or GPS-quality classification, and the audit defines no sampling-frequency expectation, density threshold, missing-interval inference, interpolation, score, or provider SLA.

Persisted provider-disabled count is a third, orthogonal dimension. It reads only `Vehicle.disabled` and does not reclassify any checkpoint. The audit never calls `/devices` or any other provider endpoint.

The command is aggregate-only and exposes no provider identity, coordinates, fingerprints, observation IDs, or raw positions. Its dedicated Nest module imports only the database module. One set-based PostgreSQL statement groups observations by vehicle and joins the persisted fleet to the exact checkpoint target and those aggregates; there is no query per vehicle. The statement is read-only. The command performs no database writes, history population, checkpoint creation/resume, retention/deletion, scheduler work, application startup integration, frontend work, or network request.

## Bounded track reads (Stage 11C)

The backend-only bounded read contract is documented in [vehicle-track-api.md](vehicle-track-api.md). It reads the shared authoritative observation table without provider, current-state, alert, or aggregate fallback.
