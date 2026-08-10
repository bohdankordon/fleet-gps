# Vehicle track persistence discovery (Stage 11A)

## Decision

Stage 11A stops at architecture discovery. The current PostgreSQL model does not contain an authoritative, sufficiently complete sequence of historical vehicle positions, so a truthful track read API cannot be implemented without a persistence stage first.

No track endpoint, provider-on-read fallback, interpolation, or trajectory derived from business aggregates is permitted.

## Persisted data that exists

- `VehicleCurrentState` is an upserted latest snapshot. A later fleet sync replaces the previous position.
- `DailyVehicleStat` is one distance/statistics aggregate per vehicle and service date. It contains no coordinate sequence.
- There is no persisted Run/Trip model, provider route payload, historical `/positions` payload, or route-point table.
- `AlertEvaluationObservation` is a durable operational journal for detector replay. It stores `vehicleId`, `observedAt`, coordinates, and speed, and has a unique `(vehicleId, observedAt)` index.

The alert journal is not an authoritative track source:

- journaling is conditional on `ALERT_INGESTION_ENABLED` and is coupled to the alert pipeline;
- it sees only latest-position fleet polls, not a historical-position feed;
- disabled vehicles and positions without `valid=true`, `outdated=false`, coordinates, timestamp, and speed are omitted;
- repeated polls of one last-known fix are deduplicated by `(vehicleId, observedAt)`;
- old last-known fixes are eligible because the bridge rejects excessive future skew but has no maximum-age requirement;
- persisted journal rows no longer carry the provider `valid`/`outdated` fields or a track completeness/retention marker.

Consequently gaps in this journal cannot be distinguished from stopped vehicles, unchanged fixes, disabled ingestion, filtered quality states, scheduler downtime, or missing provider history.

## Read-only production evidence

Snapshot taken on 2026-08-10 without identities, names, or coordinates:

- vehicles: 58;
- current-state rows: 58;
- daily-stat rows: 180;
- alert evaluation observations: 101;
- vehicles represented in the journal: 44;
- observed timestamp span: 2026-07-04T09:49:50Z through 2026-08-08T21:06:01Z;
- every represented vehicle has observations on only one UTC date;
- points per represented vehicle: minimum 1, average 2.30, median 2, maximum 8;
- distribution: 16 vehicles with 1 point, 26 with 2–5 points, 2 with more than 5 points;
- creation span: 2026-08-08T16:59:56.836Z through 2026-08-08T21:06:03.539Z;
- pending journal rows: 0; non-replay rows: 0.

This density cannot describe actual vehicle trajectories. The schema and repository search also found no retention or cleanup contract for the alert journal.

`EXPLAIN` (without `ANALYZE`) for a representative journal vehicle/range chose a sequential scan plus sort because the whole candidate table has only 101 rows. With sequential scans disabled for diagnostic purposes, PostgreSQL can use an existing vehicle/time-capable alert index. This is not a production track-plan approval: the dedicated track table and its required `(vehicleId, observedAt)` index do not exist.

## Provider data that could feed a future store

The existing eQuGPS adapter can normalize official historical `/positions` records with device ID, fix time, provider validity/outdated flags, coordinates, and speed in knots. The fleet mapper already converts valid non-negative speed to km/h. This API must be used only by an explicit ingestion/backfill workflow, never by the track GET endpoint.

The adapter also exposes `routes-new`, and earlier research observed 3,796 normalized points across two trips for one selected day. It is not currently a backfill source because route-point `fixtime` semantics remain deliberately unconfirmed and normalized route points therefore have `occurredAt=null`.

No provider request was made during this discovery.

## Minimal next-stage persistence design

Add a dedicated model such as `VehiclePositionObservation`, independent of alerts, with:

- internal UUID primary key;
- `vehicleId` UUID foreign key;
- `observedAt` `TIMESTAMPTZ(6)` from a strictly validated provider fix time;
- nullable paired `latitude`/`longitude`, with finite/range and pair constraints;
- nullable non-negative finite `speedKph` with one documented conversion at ingestion;
- nullable provider `valid` and `outdated` quality flags;
- `fetchedAt` `TIMESTAMPTZ(6)` for ingestion diagnostics;
- a small source/provenance enum such as `LATEST_POLL` or `HISTORICAL_BACKFILL`, without raw payload or external device ID in the public contract.

Recommended invariants and indexes:

- unique B-tree `(vehicleId, observedAt)` if provider research confirms one position per vehicle instant;
- treat a conflicting payload at that identity as an ingestion conflict, never last-write-wins;
- chronological reads use `ORDER BY observedAt ASC`; uniqueness removes same-time ambiguity;
- B-tree on `observedAt` (or time partitioning after measured growth) for retention cleanup;
- database constraints reject non-finite timestamps/numbers and out-of-range coordinates;
- the future GET filters only usable points and reports raw/usable/excluded counts rather than repairing data.

Persist each normalized latest observation independently of alert enablement to build forward history. Add historical backfill as an explicit, rate-limited, resumable process using internal provider IDs; do not run it from a migration, application bootstrap, or GET request. Provider retention and duplicate behavior must be measured before enabling it. Existing alert journal rows may be treated only as known sparse observations, not as proof of complete history.

Stage 11B.1 implemented the authoritative `VehiclePositionObservation` forward dataset. Stage 11B.2 subsequently measured official historical `/positions` and implemented the explicit checkpointed backfill described in [vehicle-position-history.md](./vehicle-position-history.md); the alert journal remains excluded.

## Initial retention and API-bound proposal

Start with a configurable 30-day hot retention window and measure actual row size and sustained points per vehicle/day before extending it. The previously observed 3,796 points/day example implies about 6.6 million rows for 58 vehicles over 30 days at that density, before indexes.

After production persistence has accumulated representative data, choose the read limits from p95/p99 density and response-size tests. A 24-hour maximum interval and a separate explicit point guard are reasonable candidates, but Stage 11A must not freeze those values without track-source measurements. A future over-limit response must be an explicit bounded error, never silent truncation or undocumented sampling.

## Stage 11A change boundary

This stage adds this architecture note only. Prisma schema and migrations remain unchanged; no track route, provider ingestion, production writes, or frontend work is included.

Stage 11B.1 implements the forward-only direction in [vehicle position history](vehicle-position-history.md). The discovery evidence remains the reason the alert journal is not migrated into the authoritative table.
