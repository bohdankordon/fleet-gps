# Fleet daily activity report

**DONE / HUMAN ACCEPTED.** Reports at `/reports` contains exactly one product: Daily Fleet Activity, presented as a Daily Fleet Comparison Workspace. It is historical, fleet-wide, read-only and derived on demand from stored GPS observations.

## Daily date and boundary contract

The page URL stores only `?date=YYYY-MM-DD`. The Next server resolves the selected calendar day using authenticated runtime timezone settings and fetches Nest directly with absolute `from` and `to`. The separately available same-origin BFF forwards that same public read contract. Missing, malformed or duplicate page dates intentionally fall back to Today.

Today is local midnight through the server-captured current instant. Other dates use local midnight through the next local midnight. Calendar arithmetic preserves 23-, 24- and 25-hour Europe/Kyiv days. The returned report timezone controls display; a timezone change during loading causes one re-resolution, then a safe report-context failure if it changes again.

`GET /api/reports/fleet-activity?from=<absolute-iso>&to=<absolute-iso>` requires both timestamps, `from <= to`, and at most 25 absolute hours. Reports observations use **[from,to)**: `observedAt >= from && observedAt < to`. Adjacent days do not share a midnight observation. At exact midnight Today, `[from,from)` is valid: all current fleet identities remain, with zero observations/episodes/gaps and nullable observation boundaries. This Reports-only correction does not change Trips, Movement History or the shared core's positive/inclusive contract.

## Sources and derivation

The repository uses one repeatable-read transaction (30-second transaction timeout) with two set-based reads: every current persisted Vehicle's public identity, and all VehiclePositionObservation records in the half-open interval ordered by vehicle, time and fingerprint. Disabled/provider-disabled vehicles remain included. There are no per-vehicle queries, writes or provider calls.

One ApplicationSettings read returns the effective timezone and the actual policy used for every row:
`tripMovementSpeedKph`, `tripMovementConfirmationSeconds`, `tripStopConfirmationSeconds`, `tripDataGapSeconds`.
No invented policy version is exposed. Historical reports are recomputed from currently stored observations using current policy.

The service groups observations in memory, enforces the report endpoint exclusion before calling the unchanged Stage 15A trip/stop core, and bypasses that core for an empty interval. Movement/stop confirmation, null-speed and quality-flag inclusion, Haversine distance and gap behavior remain unchanged.

| Public field | Meaning |
| --- | --- |
| generatedAt | Captured start of this backend report computation; not last GPS time or completeness |
| timezone / policy | Effective current context read for this report |
| vehicleId / vehicleName | Current safe public identity |
| hasGpsData / rawObservationCount | At least one stored observation / count in this interval; no coverage percentage |
| firstObservationAt / lastObservationAt | First/last core observation timestamps; both null without GPS |
| tripCount / tripDurationSeconds | Confirmed derived trips / sum of their durations; trip time may include short pauses |
| observedDistanceMeters | Sum of observed GPS distances inside confirmed trips; not odometer or complete traveled distance |
| stopCount / stopDurationSeconds | Confirmed derived stops / summed durations; not engine idle |
| gapCount / gapDurationSeconds | Count / sum of core internal adjacent-observation gaps above current threshold |

Time before the first and after the last observation is not an internal gap. The service does not reconstruct cross-midnight episodes using data outside the day. Daily episode results must not be assumed additive across days.

Summary retains vehicleCount, vehiclesWithGps, vehicleWithoutGpsCount, tripCount, totalObservedDistanceMeters, totalTripDurationSeconds and gapCount; totalGapDurationSeconds sums the row gap durations. All totals cover the complete fleet response and remain independent of client search/filter/sort.

## Workspace and investigation

CompactPageHeading → full-width daily Period Context with shared PeriodPopover and calculation info → unified factual summary → one Results Workspace containing local comparison controls and table/list. Today, Yesterday and a single calendar day are the only period choices. Date navigation uses router.push; Refresh uses router.refresh with no new history entry and preserves mounted comparison controls. Pending data retain their applied date and are visibly marked busy; route loading has a small skeleton. Runtime/context failure, report failure, empty fleet, no-GPS day and filtered-empty results have distinct localized presentation.

Desktop uses a dense sortable Ant Design table; below 992px, a vehicle comparison list opens complete row facts in a contextual Drawer. Search matches public vehicle names case-insensitively; GPS filter selects all/with/without observations. Default metric order is GPS rows first, observed distance descending, then deterministic UUID; desktop header alternatives are name, trips, trip time, stops, stop time and gaps. Numeric headers cycle descending → ascending → default; name cycles ascending → descending → default. Distance toggles ascending/default descending with its effective indicator always visible. Tablet/mobile uses default order and has no separate sorting control. Reset restores search, GPS filter and default sort. Active-filter count excludes sorting.

No-GPS rows retain identity and one status; numerical facts display dashes. GPS-present zero values remain factual zeroes. Summary scope remains the entire fleet, explained in methodology/help and the accessible description; no persistent scope row is shown. Policy info explains the dynamic thresholds, generation time, timezone and current-policy historical recomputation.

Reports requires reports.view independently on the page/BFF and backend. Report access does not grant navigation permissions. Vehicle identity links require vehicles.view; Trips and Movement History actions require trips.view and carry exact report from/to; Current position requires map.view and carries only vehicleId. At the empty midnight interval, Trips/History actions are disabled because their accepted APIs require a positive interval. A 25-hour History deep-link naturally uses its accepted sampled overview mode. No Events action or report-position claim is introduced.

## Limits and deferred work

The <=25-hour range is a time bound, not a row/memory bound. The complete fleet and all selected observations are read and accumulated in memory; the existing indexes and read model are unchanged. Large fleets or dense days can remain expensive. There is no fake pagination or scalability claim.

No schema migration, persisted report snapshot, auto-refresh, background calculation, provider/Telegram call, chart, utilization/driver/engine-idle inference or multi-day report is introduced. **CSV remains a recommended deferred follow-up**; CSV/XLSX/PDF/print and scheduling are absent from the human-accepted version. Multi-day semantics require a separate explicit design.

## Local verification

Focused report/core API tests and Web contract/date/model/rendered-design tests cover endpoint exclusion, empty intervals, DST, policy context, observation evidence, permissions and presentation states. Run `npm run reports:smoke --workspace @taxi-gps/web` against existing loopback runtimes with REPORTS_SMOKE_LOGIN/PASSWORD supplied externally. Optional REPORTS_SMOKE_DATE selects an existing populated day (default 2026-08-21); REPORTS_SMOKE_API_URL/WEB_URL reject non-loopback origins. The smoke creates only a local login session and makes report/runtime/SSR reads. It never seeds or mutates domain data. Browser responsive and keyboard review remains a separate acceptance gate.
