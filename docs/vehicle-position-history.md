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
