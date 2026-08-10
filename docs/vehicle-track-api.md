# Vehicle track read API

`GET /api/vehicles/:vehicleId/track?from=<timestamp>&to=<timestamp>` reads one vehicle's persisted GPS fixes from local PostgreSQL `VehiclePositionObservation`. It never calls eQuGPS, starts synchronization, reads `VehicleCurrentState` as fallback, interpolates, samples, smooths, or derives coordinates from alerts, runs, or daily statistics.

`vehicleId` is the public vehicle UUID. Both query timestamps must be strict absolute ISO date-times with explicit `Z` or a valid UTC offset. Calendar, clock, and offset values are validated without JavaScript date normalization. The interval is inclusive (`from <= observedAt <= to`), must be non-empty, and may be at most exactly 24 hours. A valid future or pre-history interval is allowed.

The database query uses `(vehicleId, observedAt, fixFingerprint)`, orders by `observedAt ASC, fixFingerprint ASC`, and requests at most 10,001 rows. Up to 10,000 points is successful. The 10,001st point produces HTTP 422; the API never silently truncates or downsamples a track.

Successful responses contain:

- `generatedAt` captured once after the consistent database read;
- `vehicle: { id, name }`;
- normalized absolute `range: { from, to }`;
- `summary: { pointCount, firstObservedAt, lastObservedAt }`;
- ordered points with only `latitude`, `longitude`, `observedAt`, nullable `speedKph`, nullable `valid`, and nullable `outdated`.

Provider quality fields are preserved as stored: `valid=false` does not imply structurally unusable coordinates, while `null` means the provider supplied no value. Persistence provenance, fingerprints, fetch/create timestamps, provider identifiers, raw payload, observation IDs, and ingestion source are never public.

A known vehicle with no observations in range returns HTTP 200 with an empty array, zero count, and null first/last timestamps. An invalid UUID/range returns 400; an unknown valid UUID returns 404; an over-limit track returns 422; unexpected stored-data or database failure returns a generic 500. Structurally corrupt coordinates, time, speed, or quality values fail safely rather than being repaired or serialized.

The Stage 11D dispatcher presentation and its conservative five-minute line-break policy are documented in [vehicle-track-map-ui.md](vehicle-track-map-ui.md).
