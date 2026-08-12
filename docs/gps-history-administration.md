# GPS history administration status (Stage 16A)

`/admin/history?to=<absolute-iso>` is a read-only administrative view of the Stage 14 historical population plan. The global **Администрирование** navigation item opens this single page; Stage 16A adds no settings hierarchy or unrelated settings.

## Explicit control point

`to` is required by the public backend endpoint `GET /api/system/position-history/horizon-status` and by the same-origin Next BFF route with the same path. It must be a strict absolute ISO timestamp containing `Z` or a numeric offset. The browser never calls Nest or the provider directly. Both Next fetches and BFF responses use `no-store`.

When `/admin/history` has no `to`, the Next server resolves one absolute current instant and redirects to the canonical URL containing that visible value before it renders a report. It is presented as **План на контрольную точку**, not as universal or continuously rolling completion. A malformed or repeated value remains a visible validation state and causes no backend status request.

The timestamp is the exact Stage 14 horizon anchor. Changing it regenerates the exact `(rangeFrom, rangeTo)` slices, so it can also change exact `(vehicleId, rangeFrom, rangeTo)` checkpoint matches. The change only recalculates a read-only plan/status; it does not move, delete, populate, or reconcile data. Stage 16A deliberately adds no rolling-anchor scheduler or automatic maintenance policy.

## Policy and planner reuse

The active product policy remains the code-level `POSITION_HISTORY_HORIZON_POLICY`: **90 absolute days**. It is not stored in the database, environment, or `ApplicationSettings`, and 365 days is not presented as active. The partitioner remains duration-driven and supports a later separately approved horizon expansion without redesign.

The endpoint calls the existing Stage 14B `PositionHistoryHorizonService`. That preserves its policy, oldest-to-newest partition contract, exact checkpoint matching, provider-disabled dimension, set-based repository query, and shared remaining-hour-window arithmetic. The Stage 14B CLI output remains oldest to newest. The admin table reverses only its presentation to newest to oldest.

The read path performs two bounded set-based database queries:

1. the existing Stage 14B query for all exact slice/vehicle checkpoint facts;
2. one inclusive Stage 14A-style aggregate over `VehiclePositionObservation` for the selected horizon.

It fetches no individual observation rows and performs no per-vehicle query.

## Meaning of the figures

**Заполнение истории** reports processed exact backfill target/vehicle pairs and estimated remaining hourly planning windows. `COMPLETED` means the accepted exact backfill target was processed. `RUNNING`, `PENDING`, and `NONE` are incomplete; a running cursor affects remaining hourly windows but does not create a fractional completion percentage.

This is not GPS coverage, observation density, vehicle movement, or data-completeness scoring. The separate **GPS-наблюдения** section reports only persisted row count, vehicles with and without at least one observation, and the first/last observation timestamps. A completed target may have zero observations, and an incomplete target may already contain observations; neither fact implies the other.

Provider-disabled is the persisted technical provider state, not a business fleet status. Disabled vehicles stay in whole-fleet target and checkpoint totals. Provider-eligible incomplete targets are shown separately to describe currently eligible planned work.

## Read-only and security boundary

The public DTO contains aggregate policy, horizon, fleet, backfill, observation, and per-slice counts only. It contains no external/provider device identifiers, vehicle UUID lists, coordinates, fingerprints, credentials, raw provider errors, or individual checkpoint cursors.

The screen and endpoint make no provider or Telegram calls, write no observations or checkpoints, create no missing checkpoints, and invoke neither the Stage 14C executor nor any scheduler. There are no populate, resume, retry, cancel, retention, deletion, cleanup, archive, or pruning actions. Manual execution remains the operator-only `position-history:horizon-populate` CLI command and cannot be launched from the browser.

Stage 16A adds no authentication or authorization. That is a separate stage; the absence of auth does not expand this page beyond aggregate read-only status.
