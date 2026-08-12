# Read-only trip/stop analytics

Stage 15A derives trips, meaningful stops, and unknown data gaps for one persisted vehicle and one explicit inclusive absolute time range. The result is calculated on demand from `VehiclePositionObservation`; it creates no `Trip`, `Stop`, segment, run, or cache row. These heuristics are application analytics policy, not eQuGPS/provider facts.

## Operator command and scope

```text
npm run position-history:trip-analysis -- \
  --vehicle 00000000-0000-4000-8000-000000000000 \
  --from 2026-08-10T00:00:00Z \
  --to 2026-08-11T00:00:00Z
```

`--vehicle`, `--from`, and `--to` are all required. The vehicle is the public UUID, timestamps must be strict absolute ISO instants with `Z` or a numeric offset, and the non-empty interval may be at most exactly seven absolute 24-hour days. Exactly seven days is allowed; one millisecond more is rejected. There is no current-time default or environment-variable equivalent. An unknown UUID is an explicit operator not-found error, while a known vehicle with no observations returns a successful empty analysis.

The command creates a database-only Nest application context and installs a fail-closed `fetch` guard. It cannot call `/devices`, latest or historical `/positions`, `routes-new`, Telegram, OpenFreeMap, or another external service. It is not imported by `AppModule`, a controller, scheduler, provider module, fleet sync, or frontend.

## Persisted query

The repository first reads only public vehicle identity (`id`, `name`) and then performs one inclusive observation query for that vehicle/range. The observation projection is limited to:

- `observedAt`;
- `fixFingerprint` (internal ordering only and omitted from results);
- `latitude` and `longitude`;
- nullable `speedKph`;
- nullable `valid` and `outdated` quality metadata.

Rows are ordered by `observedAt ASC, fixFingerprint ASC`. The two reads use a repeatable-read Prisma callback with read operations only and no locking clauses. There is no query per observation, provider fallback, current-state fallback, alert-journal fallback, SQL materialization, or database mutation. `valid=false` and `outdated=true` rows remain inputs; Stage 15A defines no new quality filtering policy.

## Pure deterministic policy

The repository/service boundary feeds a pure TypeScript state machine. Its named application policy constants are:

- `MOVEMENT_THRESHOLD_KPH = 5`;
- `MOVEMENT_CONFIRMATION_SECONDS = 60`;
- `STOP_CONFIRMATION_SECONDS = 300`;
- `DATA_GAP_SECONDS = 300`.

The equal numeric values for stop confirmation and data-gap detection deliberately have different meanings and operators: a stop requires at least 300 elapsed seconds of continuously established stopped evidence, while a raw adjacent gap is a discontinuity only when it is strictly greater than 300 seconds. Exactly 300 seconds is not a gap.

Provider `speedKph` is authoritative movement/stopped evidence. A finite speed at least 5 km/h is movement evidence; a finite speed below 5 km/h is stopped evidence. Coordinate displacement never manufactures speed or movement, so stationary GPS jitter cannot create a trip. Null or non-finite speed is unknown: it proves neither movement nor stopping and is never rewritten to zero.

Before a trip exists, consecutive movement-evidence observations form a candidate inside one continuity segment. Stopped or unknown evidence cancels it. When the current movement observation is at least 60 elapsed seconds after the candidate's first observation, the trip is confirmed and its `startAt` is backdated to that first movement observation. Same-timestamp observations have zero elapsed time and cannot by themselves confirm movement.

During an active trip, below-threshold evidence starts a stop candidate. Movement cancels it, and null/unknown evidence resets it because unknown time cannot prove continuous stopping. A candidate confirms only when its first and current stopped-evidence observations span at least 300 seconds without intervening movement or unknown evidence. Confirmation ends the trip and starts a meaningful stop at the candidate's first stopped observation, not at the later confirmation observation. A shorter pause remains inside the trip. Null speed by itself does not end an already active trip.

A confirmed stop remains active through stopped or unknown observations. Consecutive movement evidence starts a fresh movement candidate; stopped or unknown evidence cancels that candidate. After at least 60 seconds, the stop ends and the next trip begins at the first movement observation of the confirmed candidate. A meaningful standalone stop may be derived at the requested range beginning without a preceding trip.

## Gaps and boundaries

Every raw adjacent timestamp difference strictly greater than 300 seconds emits a separate gap with `fromObservedAt`, `toObservedAt`, and `durationSeconds`. The gap is unknown data: it is never a trip, stop, idle, or parking interval. An active trip or stop ends at the final pre-gap observation with `DATA_GAP`, all candidates are discarded, and the post-gap observation starts a new continuity segment. Movement and stopped state never cross the gap.

Only in-range observations are analyzed. An active event without a confirmed natural ending is a clipped/open analytical result with `RANGE_END` and `endsAtRangeBoundary=true`. Its `endAt` and `endPosition` are both the final persisted fix used by that event; requested `to` remains range metadata and is never used to fabricate unobserved duration or assert knowledge after that fix. If the final persisted fix happens to equal requested `to`, the timestamps naturally match. `startsAtRangeBoundary=true` is emitted only when the evidence-backed start timestamp equals requested `from`; it warns that the real-world event may have begun earlier. Natural `STOP`, `MOVEMENT`, and `DATA_GAP` boundaries are not marked as range ends.

## GPS-observed distance and results

Trip distance is `observedDistanceMeters`: a pure Haversine sum over adjacent usable persisted fixes inside that trip's observed interval and continuity segment. It is GPS-observed path distance, not road, routed, snapped, interpolated, or odometer distance. An edge with timestamp delta `<= 0` contributes zero, so distinct fixes at the same timestamp remain observations but no physical order or travel is invented. An edge across a `>300s` gap is never summed. Stage 15A adds no coordinate-outlier filter.

Each trip reports `startAt`, `endAt`, elapsed `durationSeconds`, `observedDistanceMeters`, timestamped start/end positions, `STOP | DATA_GAP | RANGE_END`, range-boundary flags, and inclusive observation count. Each stop reports the same temporal, position, boundary, and count fields with `MOVEMENT | DATA_GAP | RANGE_END`; it has no centroid, address, or geocode. Gaps remain a separate result list.

The summary reports vehicle identity, requested inclusive range, raw observation count, continuity segment count, trip/stop/gap counts, total GPS-observed trip distance, and nullable first/last observation timestamps. It does not claim coverage percentage, completeness, GPS SLA, addresses, route names, fare/passenger/driver facts, fuel, or inferred purpose.

Stage 15B will separately decide and implement approved public API and product UI exposure. Stage 15A changes no public Nest controller, Next BFF, vehicle/track page, map, dashboard, events UI, Prisma schema, migration, scheduler, or persistence model.
