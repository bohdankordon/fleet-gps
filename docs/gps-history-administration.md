# GPS history administration and protected population (Stages 17C–18B)

`/admin/history?to=<absolute-iso>` retains the Stage 16A administrative status view and adds one explicit, protected, bounded Stage 17C population action. The global **Администрирование** navigation item opens this single page; there is no settings hierarchy or unrelated provider configuration.

## Explicit control point

`to` is required by the public backend endpoint `GET /api/system/position-history/horizon-status` and by the same-origin Next BFF route with the same path. It must be a strict absolute ISO timestamp containing `Z` or a numeric offset. The browser never calls Nest or the provider directly. Both Next fetches and BFF responses use `no-store`.

When `/admin/history` has no `to`, the Next server resolves one absolute current instant and redirects to the canonical URL containing that visible value before it renders a report. It is presented as **План на контрольную точку**, not as universal or continuously rolling completion. A malformed or repeated value remains a visible validation state and causes no backend status request.

The timestamp is the exact Stage 14 horizon anchor. Changing it regenerates the exact `(rangeFrom, rangeTo)` slices, so it can also change exact `(vehicleId, rangeFrom, rangeTo)` checkpoint matches. Changing the form value and loading the new canonical URL only recalculates status. A later confirmed population request uses exactly the already-loaded URL value; it never substitutes browser time, server time, or a newly generated anchor.

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

## Read status and safe public boundary

The public DTO contains aggregate policy, horizon, fleet, backfill, observation, and per-slice counts only. It contains no external/provider device identifiers, vehicle UUID lists, coordinates, fingerprints, credentials, raw provider errors, or individual checkpoint cursors.

The status GET remains read-only: it makes no provider or Telegram calls, writes nothing, and invokes neither the Stage 14C executor nor a scheduler. Its public DTO remains aggregate-only.

## Protected bounded population

An account with effective `historyAdmin.populate`, including every `ADMIN`, sees **Дозаполнение истории**. A `USER` with only `historyAdmin.view` continues to see all status data but sees no execution controls. Nest remains authoritative: `POST /api/system/position-history/horizon-populate` returns 401 without a valid session and 403 for a view-only, disabled, expired/revoked, or `mustChangePassword` account as applicable.

The request body is strict and has three explicit fields: the current absolute `to`, `maxWindows`, and `excludeProviderDisabled`. Browser budgets are exactly **6, 12, or 24 hourly committed windows**, with 24 selected by default. There is no unlimited value or vehicle-count budget. `maxWindows` keeps the existing Stage 14C global committed-window meaning; it is not a count of provider requests, vehicles, or GPS points.

**Пропустить provider-disabled** is checked by default and maps directly to Stage 14C `excludeProviderDisabled=true`. Clearing it uses normal non-excluding Stage 14C behavior. `Vehicle.disabled` remains technical persisted provider state, not business/offline truth.

The first button opens a confirmation showing the exact control point, budget, and provider-disabled behavior, and warning that the operation contacts the GPS provider and may write observations and checkpoints. Only **Запустить** sends the POST; **Отмена** sends nothing. The button is disabled while pending. The browser and BFF issue one request and never retry it automatically.

The browser calls only the same-origin Next BFF. The BFF reuses the centralized Stage 17B same-origin write check, forwards only `taxi_session`, allowlists the three body fields, calls Nest once, and returns `Cache-Control: no-store`. Cross-site, same-site, or mismatched-Origin writes stop before Nest.

Nest delegates all work to the accepted Stage 14C `PositionHistoryHorizonPopulationService`; Stage 17C contains no partitioner, hourly loop, checkpoint engine, dedupe, provider retry, pacing, or remaining-window implementation. Thus newest-to-oldest order, inclusive overlap, 500 ms pacing, Retry-After behavior, stop-first-failure, checkpoint semantics, telemetry, and the global committed-window budget remain unchanged. The existing `position-history:horizon-populate` CLI remains the large controlled catch-up tool with its existing arguments and output contract; internally it enters through the same lock-aware runner.

## Cross-process execution mutex and failure behavior

One fixed application-internal PostgreSQL session advisory lock, key `1706170003`, serializes fleet-wide horizon executions—including browser requests and the large-catch-up CLI—across application instances/processes. Each execution creates one short-lived dedicated `pg.Client`, connects, calls `pg_try_advisory_lock` on that physical session, holds the session for the entire external-provider execution, and calls `pg_advisory_unlock` on the same client in `finally` before `client.end()`. Provider work does not run inside a database transaction. A dead process/connection naturally releases the PostgreSQL session lock; no fake running record is persisted.

Failure to acquire returns 409 and **Дозаполнение истории уже выполняется.** without calling the executor. A successful response exposes only safe factual Stage 14C counters: committed windows, provider requests/rows, candidates, inserts, duplicates, invalid rows, retries, rate limits, high-level slice counts, provider-disabled exclusions, budget stop, and horizon completion. It exposes no provider URL/credential/payload/error body, external numeric device ID, coordinate, fingerprint, checkpoint cursor, or session secret.

Stage 14C stops at the first established failure. Because earlier windows commit independently, an HTTP failure is not rolled back and the UI warns that part of the work may have persisted. Success and failure both refresh status for the exact same `to`; neither generates a new anchor or navigates to now.

Stage 17C deliberately remains a bounded synchronous manual action. It adds no job/lease/run table, queue, worker, polling, cancellation, pause/resume, scheduler, cron, startup catch-up, automatic rolling maintenance, retention, deletion, pruning, archive, or cleanup. The 90-day planning policy is not automatic population or retention deletion.

## Separate durable background population (Stage 18B)

The same page now also shows durable active/recent state to `historyAdmin.view`. Operators with effective `historyAdmin.populate` receive a distinct confirmed create flow with exact presets **500 / 1000 / 5000** (default 1000) and provider-disabled exclusion checked by default. The request uses the exact current `to` anchor. It creates a USER run attributed from the authenticated server principal; the browser cannot provide an initiator or user ID. One active PENDING/RUNNING row remains database-enforced and produces safe 409. Terminal history is a newest-first fixed list of ten and has no deletion or resume control.

The server polls existing durable rows every 30 seconds through the Stage 18A worker and shared lock `1706170003`; the poller itself never creates work. The page reads active state every five seconds and refreshes the same-anchor planner plus terminal history as progress changes. This polling never executes population, and closing the page does not stop server/database-owned work. Transport ambiguity may cause one active-status GET but never an automatic second create POST. Expired RUNNING rows recover through the existing lease model.

## Automatic rolling maintenance (Stage 18C)

Automatic maintenance is enabled only by the operational environment flag `POSITION_HISTORY_MAINTENANCE_ENABLED=true`; missing or `false` means disabled. When enabled, `POSITION_HISTORY_MAINTENANCE_WINDOW_BUDGET` must be explicitly set to a strict decimal integer from 1 through 5000; the intended initial Stage 24B production value is `2000`. It limits hourly committed windows in each automatically created SYSTEM run, not the 90-day horizon, and does not trigger manual backfill or change retries, pacing, or worker chunking. It has no browser configuration. At exactly 03:00 UTC daily, with no startup catch-up, the evaluator skips any active USER or SYSTEM durable run, computes the latest already-occurred Tuesday 02:00 UTC anchor, and invokes the existing Stage 14 planner read-only. Weekly anchors move only in seven-day increments so existing seven-day slices and checkpoints remain reusable. The approved trade-off is up to almost seven days of automatic backfill lag; fleet synchronization remains responsible for current positions, and the existing Stage 17C/18B manual options remain available.

Only a positive provider-eligible `estimatedRemainingHourlyWindows` value creates work. Provider-disabled-only incomplete checkpoints or absent observation rows do not trigger a SYSTEM row. The created row is PENDING, `SYSTEM`, has no requested user, always excludes provider-disabled vehicles, and carries the configured maintenance-window budget. The evaluator never calls the provider or worker. Execution remains with the Stage 18B 30-second poller, Stage 18A worker, Stage 14C executor, and shared lock `1706170003`.

The PostgreSQL one-active-row constraint resolves multi-instance creation races without another lock or leader election. FAILED rows remain terminal; a later daily evaluation may create a new row when planner work remains, never reopen or retry the failed row. SUCCEEDED history similarly does not suppress future planner-driven work. The UI labels USER runs `Оператор` and SYSTEM runs `Автоматически`; view-only users can inspect either, and any active run hides durable create controls. There is no public SYSTEM-create route, maintenance button, cancel/pause/resume, retention, deletion, automatic pruning, or 365-day setting.
