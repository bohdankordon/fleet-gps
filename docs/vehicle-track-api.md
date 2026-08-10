# Vehicle track read API

## Exact observations (Stage 11C)

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

## Sampled multi-day overview (Stage 12A)

`GET /api/vehicles/:vehicleId/track/overview?from=<timestamp>&to=<timestamp>` is a separate read-only contract for a bounded representative multi-day track. It uses only local PostgreSQL `VehiclePositionObservation`. It does not call eQuGPS, backfill, fleet sync, alerts, Telegram, OpenFreeMap, or any write path. It does not change or extend the exact endpoint above.

Both boundaries are inclusive and use the same strict absolute ISO parser. The elapsed range must be non-empty and no longer than exactly seven days; exactly seven days is valid. A valid future or pre-history range returns an empty HTTP 200 response. Malformed input is 400 and an unknown valid vehicle UUID is 404.

The overview always declares `sampled: true`: callers must treat its geometry as a sampled representation, never as the exact driven route or the complete observation journal. It never interpolates, smooths, or invents coordinates. When the raw range has no more than 2,000 observations, every point passes through, but the endpoint remains the overview contract; equality of `rawPointCount` and `returnedPointCount` communicates that no rows were omitted.

The hard bound is `MAX_OVERVIEW_POINTS = 2,000`. PostgreSQL performs the raw vehicle/range scan, segmentation, counts, and deterministic selection. Node receives only the selected rows and summary aggregates. The SQL order is `observedAt ASC, fixFingerprint ASC`; `fixFingerprint` is an internal deterministic tie-break for distinct fixes at the same timestamp and is never returned.

Before sampling, SQL computes `LAG(observedAt)` over the complete raw ordered range. A difference above 300 seconds starts a new raw segment; zero through exactly 300 seconds stays connected. Segment membership is carried into the sampled result. Consequently a true raw gap remains a segment break, while a large timestamp difference caused only by omitted intermediate observations remains inside one segment and cannot become a false gap.

For an over-target range, global first and last observations and at least one representative of every raw segment are mandatory. The remaining budget is distributed deterministically across non-mandatory ordinal ranks using equal integer-rank intervals. This is density-proportional ordinal sampling, not a geometric simplifier: intermediate turns can be omitted. If pathological fragmentation alone would require more than 2,000 mandatory representatives, the API returns 422 rather than silently dropping a segment or exceeding the bound.

Successful responses have this exact public shape:

```json
{
  "generatedAt": "2026-08-10T12:00:00.000Z",
  "vehicle": { "id": "00000000-0000-4000-8000-000000000001", "name": "Taxi" },
  "range": { "from": "2026-08-01T00:00:00.000Z", "to": "2026-08-08T00:00:00.000Z" },
  "summary": {
    "rawPointCount": 47000,
    "returnedPointCount": 2,
    "segmentCount": 2,
    "gapCount": 1,
    "qualityWarningCount": 14,
    "firstObservedAt": "2026-08-01T00:00:01.000Z",
    "lastObservedAt": "2026-08-07T23:59:59.000Z",
    "sampled": true
  },
  "segments": [
    {
      "rawPointCount": 24000,
      "firstObservedAt": "2026-08-01T00:00:01.000Z",
      "lastObservedAt": "2026-08-03T10:00:00.000Z",
      "points": [
        {
          "latitude": 49.2,
          "longitude": 28.4,
          "observedAt": "2026-08-01T00:00:01.000Z",
          "speedKph": 31.5,
          "valid": true,
          "outdated": false
        }
      ]
    },
    {
      "rawPointCount": 23000,
      "firstObservedAt": "2026-08-03T10:06:00.000Z",
      "lastObservedAt": "2026-08-07T23:59:59.000Z",
      "points": [
        {
          "latitude": 49.25,
          "longitude": 28.45,
          "observedAt": "2026-08-07T23:59:59.000Z",
          "speedKph": null,
          "valid": null,
          "outdated": null
        }
      ]
    }
  ]
}
```

In every response, `segments.length === summary.segmentCount`, the sum of segment `rawPointCount` values equals `summary.rawPointCount`, and the sum of segment point-array lengths equals `summary.returnedPointCount`.

`qualityWarningCount` is the exact raw count where `valid=false OR outdated=true`; nullable quality remains unknown rather than bad. Selected points retain their stored nullable quality fields, but warning rows are not forced into the limited point budget. Observation IDs, fingerprints, ingestion/fetch/create fields, provider identifiers, and raw payloads are never public.

The repository uses a bounded 10-second `REPEATABLE READ` transaction. Vehicle existence and the sampling query share that snapshot; raw counts and sampled points are produced by the same SQL statement. The initial predicate matches `vehicle_position_observations_vehicle_time_idx (vehicle_id, observed_at, fix_fingerprint)`. PostgreSQL may prefer a sequential scan when the tiny local table and requested range contain nearly every row; selective vehicle/range plans use the composite index. No PostGIS, Timescale, schema change, or migration is required.
