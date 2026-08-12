# Fleet daily activity report

Stage 15C adds the global **Отчёты** destination at `/reports`. It contains one read-only report: daily fleet activity. The report is derived on demand from persisted `Vehicle` and `VehiclePositionObservation` rows; it is not a provider-native report and is never persisted.

## Date semantics

The page URL stores only `?date=YYYY-MM-DD`. The web application resolves that Europe/Kyiv calendar date into explicit absolute `from` and `to` timestamps before calling the BFF and Nest API. Today means Kyiv start-of-day through the current instant. A historical date means its complete Kyiv calendar day, so DST days may be 23, 24, or 25 absolute hours. Missing or malformed page dates fall back to the current Kyiv date.

The public read endpoint is `GET /api/reports/fleet-activity?from=<absolute-iso>&to=<absolute-iso>`. Both timestamps are required, `from < to`, and the maximum duration is exactly 25 absolute hours. This ceiling supports the Kyiv DST fall-back day; it does not introduce a general 25-hour analytics range product.

## Derivation and metrics

The repository performs two bounded set-based reads: all persisted vehicles with safe display identity, then all required observations in the selected range ordered by vehicle, timestamp, and fingerprint. Observations are grouped in memory and passed to the accepted Stage 15A pure trip/stop analytics core. There is no vehicle-dependent query count.

Every persisted vehicle appears once, including provider-disabled vehicles and vehicles without observations. `hasGpsData` means `rawObservationCount > 0`. A missing observation set is displayed as **Нет GPS-данных** and is not interpreted as inactivity. Observations with zero confirmed trips remain GPS data.

Fleet and row metrics are sums of Stage 15A results: trips and trip durations, GPS-observed trip distance, meaningful stops of at least five minutes and their durations, and GPS gaps. Distance is not road or odometer distance. Gaps remain unknown discontinuities.

**Время поездок** is trip duration, not continuous moving time, because an accepted trip may include a short pause. The UI intentionally provides no utilization, driver score, average speed, revenue, or other unapproved business metrics.

The report uses only observations inside the selected day. Events at its boundaries may therefore be clipped or under-classified. It does not query outside the day to reconstruct cross-midnight activity.

## UI and drill-down

The report shows the fleet summary and one deterministic row per vehicle: GPS vehicles first by observed distance descending, then no-data vehicles, with a stable UUID tie-breaker that is not displayed. There are no filters, interactive sorting, map, or export controls.

Each row links to the existing Stage 15B Trips page with the report's exact absolute `from` and `to`. The report does not recompute the range for drill-down and does not auto-select a trip or stop.

The browser calls the same-origin Next BFF, which calls Nest with `no-store` behavior. The endpoint performs no database writes, provider calls, Telegram calls, history population, checkpoint mutation, geocoding, routing, scheduling, caching, or background calculation. There is no schema change or migration.
