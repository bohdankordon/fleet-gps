# Magic numbers final reconciliation audit

Status: evidence and decisions only. This document is the authoritative
reconciliation of the original configurability requirement.

Audit baseline: `main` at `2d9c3f381c76dbd8ea127c7b117e646257728fb8`; at audit
start `origin/main` pointed to the same commit and the working tree was clean.
No production host, database, provider, or Telegram endpoint was accessed.

## Verdict

**B — MAGIC NUMBERS RECONCILED — SMALL REMEDIATION REQUIRED.**

There are **0 missing meaningful global business settings** and **0 missing
per-user settings**. The completed settings foundation covers the business
questions found in the runtime. A small, bounded consistency backlog remains:

1. `apps/web/src/components/dashboard-client.tsx` has a `Europe/Kyiv`
   fallback even though the dashboard response already carries the authoritative
   timezone.
2. The vehicle-track overview's 300-second segment gap is independently
   declared in the API SQL path and the Web presentation path. The values agree
   today, but they can drift.
3. `docs/alert-rule-settings.md` still describes the pre-admin-settings stage as
   having no edit endpoint/UI and no HTTP geofence write path. The current
   admin API accepts the geofence patch and the Web UI deliberately presents it
   as read-only. The old document is now explicitly marked historical; the
   supported surface still needs one implementation-level contract decision.
4. The 90-day history horizon/retention policy is repeated in server policy,
   Web contracts, fixtures, and fallbacks. It is not a fleet business setting,
   but the Web contract should not silently reject a future operator-policy
   change.
5. The pure trip/stop core has a standalone default equal to the persisted
   defaults. This is intentional for isolated pure callers/tests; all current
   production service/report paths inject the database policy. It remains a
   documented drift guard, not a new setting.

These are consistency/documentation remediations, not a new settings stage.
The roadmap therefore puts a small remediation item in **NOW** and keeps design
work in **NEXT**.

## Scope and method

The review covered current `apps/api`, `apps/web`, `packages`, `src`, runtime
scripts, `ops`, Prisma schema/migrations, configuration parsers, settings API
and UI, and focused history/Telegram/alert/report documentation. A semantic
candidate means one meaningful policy or control family; ordinary structural
numbers, test values, protocol status codes, CSS/layout values, indexes, and
conversion arithmetic were not counted as missing settings.

Each of the 61 candidates in the canonical table has exactly one classification:

| Class | Meaning |
|---|---|
| A | Global business setting, already configurable by ADMIN |
| B | Per-user setting, already configurable |
| C | Global business setting, missing |
| D | Per-user setting, missing |
| E | Operational/infrastructure configuration; not normal business UI |
| F | Intentional technical constant |
| G | Security/safety constant |
| H | External contract/provider constant |
| I | Presentation/UX/API product constant |
| J | Test-only/fixture value |

## Authoritative persisted global settings inventory

The `ApplicationSettings` PostgreSQL singleton (`id = 1`) is the source of
truth. The Prisma defaults are persisted defaults, not frontend defaults. The
ADMIN surface is `GET/PATCH /api/admin/settings`; updates are revision
protected and produce `SETTINGS_UPDATED` audit entries. The Web admin form edits
all scalar fields and shows the geofence summary read-only. Source of the
field list and response contract: `apps/api/src/modules/admin-settings/`;
schema: `apps/api/prisma/schema.prisma`.

| Setting | Type; default | Validation | Owner/scope | Main runtime consumers | Surface; protection; audit |
|---|---|---|---|---|---|
| `timezone` | string; `Europe/Kyiv` | Valid `Intl` timezone; non-empty | ADMIN; global | Dashboard service date; runtime settings; vehicle details; reports; Telegram message timestamps; scheduler display | Admin API/Web Settings; revision protected; audited |
| `minimumDailyDistanceMeters` | integer; `500` | `0..10,000,000` m | ADMIN; global | Dashboard `belowMinimumDistance` qualification | Admin API/Web Settings; revision protected; audited |
| `positionFreshnessSeconds` | integer; `300` | `1..86,400` s | ADMIN; global | Dashboard, fleet map, vehicle details current-state freshness | Admin API/Web Settings; revision protected; audited |
| `speedRuleEnabled` | boolean; `true` | boolean | ADMIN; global | Speeding detector context and reset notifier | Admin API/Web Settings; revision protected; audited |
| `citySpeedLimitKph` | integer; `50` | `1..200` km/h; combined effective threshold `<=250` | ADMIN; global | City speeding threshold | Admin API/Web Settings; revision protected; audited |
| `outsideCitySpeedLimitKph` | integer; `90` | `1..200` km/h; combined effective threshold `<=250` | ADMIN; global | Outside-city speeding threshold | Admin API/Web Settings; revision protected; audited |
| `speedToleranceKph` | integer; `10` | `0..50` km/h; combined effective threshold `<=250` | ADMIN; global | Adds margin to both speed-zone thresholds | Admin API/Web Settings; revision protected; audited |
| `speedingConfirmationUpdates` | integer; `2` | `1..10` observations | ADMIN; global | Speeding state-machine confirmation and bounded replay bootstrap | Admin API/Web Settings; revision protected; audited |
| `inactivityRuleEnabled` | boolean; `true` | boolean | ADMIN; global | Inactivity detector context and reset notifier | Admin API/Web Settings; revision protected; audited |
| `inactivityDistanceMeters` | integer; `300` | `0..5,000` m | ADMIN; global | Inactivity low-distance window | Admin API/Web Settings; revision protected; audited |
| `inactivityDurationMinutes` | integer; `60` | `1..1,440` min | ADMIN; global | Inactivity window and observation replay cutoff | Admin API/Web Settings; revision protected; audited |
| `tripMovementSpeedKph` | integer; `5` | `1..200` km/h | ADMIN; global | Trip movement classification | Admin API/Web Settings; revision protected; audited |
| `tripMovementConfirmationSeconds` | integer; `60` | `1..604,800` s | ADMIN; global | Trip-start confirmation | Admin API/Web Settings; revision protected; audited |
| `tripStopConfirmationSeconds` | integer; `300` | `1..604,800` s | ADMIN; global | Stop confirmation and trip ending | Admin API/Web Settings; revision protected; audited |
| `tripDataGapSeconds` | integer; `300` | `1..604,800` s | ADMIN; global | Segment/data-gap handling in trip/stop analytics | Admin API/Web Settings; revision protected; audited |
| `cityGeofenceGeoJson` | nullable JSON Polygon; `null` | Closed finite lon/lat rings; validated Polygon only | ADMIN; global | City/outside-city speeding classification; map summary | Admin API PATCH accepts it; Web UI read-only summary; revision protected; audited |

The schema also retains `telegramChatId` and `dailyReportMinuteOfDay`. Current
runtime search found no consumer, and neither is in `ADMIN_SETTINGS_FIELDS`.
They are legacy schema residue, not missing settings and not a source for new
behavior.

## Authoritative per-user inventory

Persisted notification preferences live in `UserNotificationPreferences` and
selected vehicle IDs in `UserNotificationVehicle`. Preference updates are
revision protected but are not `SETTINGS_UPDATED` global audit entries. The
Telegram connection/link lifecycle is separate account state; link and
disconnect events are audited. The Web surface is Account → Notifications and
the API is `/api/account/notifications/preferences`.

| User-owned value | Type; default | Runtime purpose | Protection/audit |
|---|---|---|---|
| Telegram master `enabled` | boolean; `false` | Opt the account into delivery | Revision protected; no global settings audit |
| Telegram `speedingEnabled` | boolean; `true` | Account alert-type preference | Revision protected; no global settings audit |
| Telegram `inactivityEnabled` | boolean; `true` | Account alert-type preference | Revision protected; no global settings audit |
| Telegram `vehicleScope` | `ALL | SELECTED`; `ALL` | Account vehicle authorization scope | Revision protected; no global settings audit |
| Selected vehicle IDs | UUID list; empty unless `SELECTED` | Account-specific vehicle filter | Transactional with preference revision; no global settings audit |
| Locale cookie `taxi_locale` | `ru | uk | en`; `ru` | Presentation language; one-year cookie | Same-origin cookie write; no DB revision/audit |

No current product behavior provides per-user alert thresholds, quiet hours,
digest cadence, or personal business-rule overrides. No such setting should be
invented to make global fleet policy look user configurable.

## Canonical findings table

The table counts semantic candidate families, not every occurrence of a literal
in tests or compiled output. A grouped row groups values that have one owner,
one purpose, and one decision.

| # | Area | Value / concept | Current literal/default | Unit | Source location(s) | Runtime purpose | Current configurability | Current owner/scope | Class | Recommended action | Priority | Reason |
|---:|---|---|---|---|---|---|---|---|:---:|---|:---:|---|
| 1 | Global settings | `timezone` | `Europe/Kyiv` | IANA timezone | `schema.prisma`; `admin-settings.service.ts` | Calendar/service-date and displayed timestamps | DB + ADMIN API/Web | ADMIN/global | A | Retain; consume server value | — | Authoritative persisted setting |
| 2 | Global settings | `minimumDailyDistanceMeters` | `500` | m | `schema.prisma`; dashboard query | Daily below-threshold qualification | DB + ADMIN API/Web | ADMIN/global | A | Retain | — | One intentional dashboard business concept |
| 3 | Global settings | `positionFreshnessSeconds` | `300` | s | `schema.prisma`; dashboard/fleet-map/vehicle-details repositories | User-visible current-position freshness | DB + ADMIN API/Web | ADMIN/global | A | Retain | — | Provider `outdated` and future-skew checks remain separate safety rules |
| 4 | Speeding | `speedRuleEnabled` | `true` | boolean | `schema.prisma`; `speeding-detector.service.ts` | Enable/disable speeding detector | DB + ADMIN API/Web | ADMIN/global | A | Retain | — | Detector context reads typed setting |
| 5 | Speeding | City speed limit | `50` | km/h | `schema.prisma`; `alert-settings.validation.ts` | Base city threshold | DB + ADMIN API/Web | ADMIN/global | A | Retain | — | No hidden city threshold found |
| 6 | Speeding | Outside-city speed limit | `90` | km/h | `schema.prisma`; `alert-settings.validation.ts` | Base outside-city threshold | DB + ADMIN API/Web | ADMIN/global | A | Retain | — | No hidden outside threshold found |
| 7 | Speeding | Speed tolerance | `10` | km/h | `schema.prisma`; `speeding-detector.service.ts` | Margin added to both zone limits | DB + ADMIN API/Web | ADMIN/global | A | Retain | — | Effective values are computed, not separately stored |
| 8 | Speeding | Confirmation updates | `2` | observations | `schema.prisma`; state machine; ingestion bootstrap | Consecutive confirmation and replay depth | DB + ADMIN API/Web | ADMIN/global | A | Retain | — | No extra grace/consecutive threshold exists |
| 9 | Inactivity | `inactivityRuleEnabled` | `true` | boolean | `schema.prisma`; `inactivity-detector.service.ts` | Enable/disable inactivity detector | DB + ADMIN API/Web | ADMIN/global | A | Retain | — | Detector context reads typed setting |
| 10 | Inactivity | Low-distance threshold | `300` | m | `schema.prisma`; inactivity state machine | Distance allowed in inactivity window | DB + ADMIN API/Web | ADMIN/global | A | Retain | — | Business definition, not scheduler cadence |
| 11 | Inactivity | Inactivity duration | `60` | min | `schema.prisma`; inactivity state machine; ingestion bootstrap | Time window and replay cutoff | DB + ADMIN API/Web | ADMIN/global | A | Retain | — | No separate resolution threshold found |
| 12 | Trips/stops | Movement speed | `5` | km/h | `schema.prisma`; `trip-stop-analytics-policy.service.ts` | Movement versus stopped classification | DB + ADMIN API/Web | ADMIN/global | A | Retain | — | Current policy supplied to core and reports |
| 13 | Trips/stops | Movement confirmation | `60` | s | `schema.prisma`; `trip-stop-analytics.core.ts` | Trip start confirmation | DB + ADMIN API/Web | ADMIN/global | A | Retain | — | Current policy supplied to core and reports |
| 14 | Trips/stops | Stop confirmation | `300` | s | `schema.prisma`; `trip-stop-analytics.core.ts` | Stop/trip end confirmation | DB + ADMIN API/Web | ADMIN/global | A | Retain | — | Deliberately separate from data-gap policy |
| 15 | Trips/stops | Data-gap threshold | `300` | s | `schema.prisma`; `trip-stop-analytics.core.ts` | Segment breaks and gap reporting | DB + ADMIN API/Web | ADMIN/global | A | Retain | — | Deliberately separate from stop confirmation |
| 16 | Speeding/geofence | `cityGeofenceGeoJson` | `null` | GeoJSON Polygon | `schema.prisma`; `admin-settings`; `city-geofence` | City/outside-city zone classification | ADMIN API patch; read-only Web summary | ADMIN/global | A | Clarify supported API/UI contract | P2 | Existing setting; surface/documentation mismatch only |
| 17 | Telegram | Master enablement | `false` | boolean | `UserNotificationPreferences`; Telegram linking service | Account delivery opt-in | Account API/Web | User/account | B | Retain | — | User-owned preference |
| 18 | Telegram | Speeding preference | `true` | boolean | `UserNotificationPreferences`; recipient planner/recheck | Suppress or allow speeding messages | Account API/Web | User/account | B | Retain | — | Does not alter detector policy |
| 19 | Telegram | Inactivity preference | `true` | boolean | `UserNotificationPreferences`; recipient planner/recheck | Suppress or allow inactivity messages | Account API/Web | User/account | B | Retain | — | Does not alter detector policy |
| 20 | Telegram | Vehicle scope | `ALL` | enum | `UserNotificationPreferences`; recipient planner/recheck | Account notification scope | Account API/Web | User/account | B | Retain | — | Authorization rechecked at delivery |
| 21 | Telegram | Selected vehicles | empty list | UUID list | `UserNotificationVehicle`; preference service | Account-specific selected fleet | Account API/Web | User/account | B | Retain | — | Selection is preference-only |
| 22 | Presentation | Locale | `ru` | locale code/cookie | `apps/web/src/i18n/locales.ts`; locale route | Display language | Cookie/API; not DB | User/browser | B | Retain | — | Legitimate user presentation preference |
| 23 | Operations | Runtime feature gates | mostly default-off | boolean | `apps/api/src/config/api-config.ts` | Enable sync, alerts, history, retention, Telegram workers | ENV/config parser | Operator/deployment | E | Keep outside business UI | — | Deployment controls, not fleet policy |
| 24 | Operations | Fleet sync interval | `60` | s | `api-config.ts`; sync scheduler | Poll fleet provider | ENV, bounded | Operator/deployment | E | Keep ENV-configurable | — | Worker cadence |
| 25 | Operations | Runs sync interval | `300` | s | `api-config.ts`; sync scheduler | Poll provider runs | ENV, bounded | Operator/deployment | E | Keep ENV-configurable | — | Worker cadence |
| 26 | Operations | Scheduler shutdown timeout | `50,000` | ms | `api-config.ts`; scheduler | Graceful shutdown bound | ENV, bounded | Operator/deployment | E | Keep ENV-configurable | — | Process lifecycle |
| 27 | Operations | DB pool/connection/idle controls | `10 / 5,000 / 30,000` | connections/ms | `api-config.ts` | Database resource tuning | ENV, bounded | Operator/deployment | E | Keep ENV-configurable | — | Infrastructure |
| 28 | Provider operations | eQuGPS request/run timeouts | `15,000 / 45,000` | ms | `packages/equgps`; API config | Provider protection and run bounds | ENV/config | Operator/deployment | E | Keep outside Admin UI | — | Provider/worker tuning |
| 29 | Notifications | Legacy/per-user dispatch intervals | `60,000` | ms | `api-config.ts`; notification schedulers | Delivery worker cadence | ENV, bounded | Operator/deployment | E | Keep ENV-configurable | — | Queue mechanics |
| 30 | Notifications | Legacy/per-user batch sizes | `20` default; `1..100` bound | deliveries | `api-config.ts`; dispatchers | Delivery throughput bound | ENV, bounded | Operator/deployment | E | Keep ENV-configurable | — | Queue mechanics |
| 31 | History operations | Maintenance window budget | `5,000` | hourly windows | `api-config.ts`; maintenance service | Bound one enabled maintenance pass | ENV/config when enabled | Operator/deployment | E | Keep operator-owned | — | Explicit operational budget |
| 32 | History operations | Durable run lease/heartbeat | `120,000 / 30,000` | ms | `position-history-population-run.constants.ts` | Worker ownership and stale-run detection | Code | Operator/deployment | E | Consider ENV only if load tuning becomes necessary | P3 | Operational timing, not fleet behavior |
| 33 | History operations | Durable run chunk/poll | `24 / 30,000` | windows/ms | population-run constants/poller | Worker progress and UI status polling | Code | Operator/deployment | E | Leave unless operations show need | — | Bounded maintenance mechanics |
| 34 | History operations | Horizon/retention policy and destructive budgets | `90` days; `5,000 / 25,000` rows; `500 / 1,000` batches | days/rows | horizon policy; retention types/service | Active horizon and bounded retention deletion | Code policy; no fleet setting | Operator/storage | E | Retain as operator/storage policy; align duplicate representations | P3 | Storage/privacy/destructive impact |
| 35 | History provider operations | Backfill window/pacing/retries | `1h / 500ms / 3 / 60s`; `10,000` rows/window | time/attempts/rows | `position-history-backfill.constants.ts`; backfill service | Provider-safe historical fetch | Code | Operator/provider | E | Leave code-owned unless provider operations require tuning | — | Provider protection and safety |
| 36 | Operations monitoring | Backup/monitor reminder and request timings | source-controlled monitor thresholds | hours/ms | `ops/lib/monitor-*`; monitor tests | Operations health notification | Ops source/config | Operator/ops | E | Keep out of fleet Settings; split to ops config only if needed | P3 | Not application business semantics |
| 37 | Technical math | Unit conversion and Earth radius | `1,000`; `6,371,000` | ms/m | trip core; distance helpers | Correct arithmetic and geodesic approximation | Code | Developer/runtime | F | Leave in code | — | Mathematical implementation constants |
| 38 | Technical boundary | Pure trip/stop default policy | `{5,60,300,300}` | mixed | `trip-stop-analytics.constants.ts` | Standalone pure-core/test fallback | Code fallback; production injects DB | Developer/test boundary | F | Document; do not treat as production bypass | P3 | Intentional isolated-caller default |
| 39 | Technical geometry | Geometry epsilon and planar calculation details | tiny epsilon/coordinate arithmetic | numeric | `city-geofence` module | Stable point-in-polygon calculation | Code | Developer/runtime | F | Leave in code | — | Geometry implementation, not city policy |
| 40 | Technical calendar | Absolute elapsed-day arithmetic | `24*60*60*1,000` | ms/day | history horizon/retention policies | DST-independent storage windows | Code | Developer/runtime | F | Leave in code | — | Time arithmetic invariant |
| 41 | Safety/provider | Future position skew | `60,000` | ms | `common/position-time.policy.ts` | Reject unsafe future provider fixes | Code | Runtime safety | G | Leave in code | — | Data-validity guard, not freshness policy |
| 42 | Security | Session token size and lifetime | `32` bytes; `7` days | bytes/days | `auth.constants.ts`; auth service | Session security | Code/config security policy | Security owner | G | Leave tightly controlled | — | Not a business setting |
| 43 | Security | Login rate limiter | `5` failures/`15` min; `15` min block; `10,000` entries | count/time/entries | `login-rate-limiter.ts` | Brute-force protection | Code | Security owner | G | Leave tightly controlled | — | Security policy |
| 44 | Security | Password/hash bounds | `15..128`; Argon2id profile; fixed salt/tag sizes | chars/bytes/cost | auth password service/constants | Credential safety | Code | Security owner | G | Leave tightly controlled | — | Casual UI configurability is unsafe |
| 45 | Safety/validation | Settings/API safety bounds | e.g. speed `1..200`, effective `<=250`, trip max `604,800`, body `64KiB` | mixed | validation modules; bounded-body | Prevent invalid, unsafe, or unbounded requests | Code invariants | Runtime/security | G | Keep invariant bounds; server remains authoritative | — | Bounds are not missing business settings |
| 46 | Provider contract | eQuGPS response modes/fields/validity semantics | provider-defined | protocol | `packages/equgps`; normalization modules | Map external responses into domain data | Code adapter | Provider boundary | H | Leave in adapter | — | External contract |
| 47 | Telegram security contract | Link token TTL and rate limit | `10` min; `5` per `10` min | time/count | `telegram-linking.service.ts`; rate limiter | Secure private-chat linking | Code/security | Security/provider boundary | H | Leave tightly controlled | — | Not account preference |
| 48 | Telegram transport contract | Bot request timeout and retry/status behavior | `5,000` ms product bot; HTTP/429/5xx semantics | ms/status | Telegram bot transport; notification retry policy | Safe external delivery | Code/config plus provider semantics | Provider/ops | H | Keep outside Account/ADMIN business UI | — | Transport mechanics |
| 49 | External protocols | UUID/GeoJSON/HTTP/Telegram shape constraints | protocol-defined | protocol | API validators; Telegram webhook/controller | Interoperate safely with external systems | Code | Provider boundary | H | Leave in contracts | — | Not fleet policy |
| 50 | Track API | Exact-track maximum elapsed range | `24` | hours | API/Web track range modules | Bound exact history query | Code contract | Product/API | I | Leave as product/API safety limit | — | Not fleet business behavior |
| 51 | Track API | Exact-track point cap | `10,000` | points | `vehicle-track-query.repository.ts` | Prevent dense query response | Code contract | Product/API | I | Leave as API limit | — | Performance/safety |
| 52 | Track API | Overview maximum elapsed range | `7` | days | overview query params | Bound overview query | Code contract | Product/API | I | Leave as API limit | — | Product/safety limit |
| 53 | Track API | Overview sample cap | `2,000` | points | overview query repository/service | Bound selected overview response | Code contract | Product/API | I | Leave as API limit | — | Performance/safety |
| 54 | Track presentation | Overview segment gap | `300` | s | API overview SQL/service and Web presentation | Break lines across raw-data gaps | Code contract duplicated | Product/API + presentation | I | Unify the semantic source/contract | P2 | Same value in two runtimes can drift |
| 55 | Fleet map | Vehicle result cap | `1,000` | vehicles | `fleet-map` repository | Bound map snapshot | Code contract | Product/API | I | Leave as API limit | — | Map performance |
| 56 | Alert UI/API | Open map/recent/detail caps | `1,000 / 10 / 2` | events/events/active alerts | alert query; vehicle details read models | Bound alert surfaces | Code contract | Product/API/UX | I | Leave as product limits | — | Density/readability and response safety |
| 57 | Pagination | Alert/audit page limits | default `50`; max `100`; audit `50` | rows/page | query params; audit read types | Bound list responses | Code contract | Product/API | I | Leave as API limits | — | Not fleet policy |
| 58 | Reports/UI | Fleet activity report maximum range | `25` | elapsed hours | `fleet-activity-report.controller.ts` | Permit DST-safe day-plus report request | Code contract | Product/API | I | Leave as product limit | — | Query safety; report uses current trip policy |
| 59 | Presentation | Poll/debounce and legacy Kyiv display/input | `5s` UI run poll; `30s` status/poll; `300ms` debounce; `Europe/Kyiv` legacy explicit input/display | mixed | Web polling/navigation; `vehicle-track-custom-range.ts`; `i18n/locales.ts` | UI responsiveness and established display/input contracts | Code | Presentation/UX | I | Document intentional exceptions; fix only if product semantics change | P3 | Not a hidden detector/business setting |
| 60 | Tests/fixtures | Test-only defaults, sample coordinates, dates, counts | fixture-specific | mixed | `*.test.ts`, `*.test.tsx`, fixtures | Verify contracts and edge cases | Test-only | Test owner | J | Leave in tests | — | No production implication |
| 61 | Research/probes | Offline scripts and probe literals | script-specific | mixed | root `src`; non-runtime probes | Research/import/smoke behavior | Script-only | Developer/ops | J | Keep separate from app settings | — | Not application runtime |

Counts: **61 total; A 16; B 6; C 0; D 0; E 14; F 4; G 5; H 4; I 10; J 2.**
Combined counts requested for reporting are **F/G/H = 13** and **I/J = 12**.

## Domain conclusions

### Speeding

The full path is position eligibility → alert observation journal →
`SpeedingDetectorService` → state machine → event lifecycle → recipient
planning/recheck → delivery. Business semantics are fully controlled by the
global settings: enabled flag, city/outside limits, shared tolerance,
confirmation updates, and geofence zone. Effective thresholds are computed at
read time (`60` and `100` km/h with defaults); the event stores its threshold
snapshot. The detector has no hidden grace period, extra minimum consecutive
count, resolution threshold, or separate data-age business setting.

The ingestion bootstrap uses the configured confirmation count and an
inactivity-duration-derived replay cutoff. That cutoff is replay safety, not a
new speeding rule. Settings changes reset in-memory speeding/inactivity
contexts after commit. Verdict: **no missing speeding setting**.

### Inactivity

The detector uses the configured enablement, distance, and duration. The state
machine accumulates observed distance within the configured duration window and
resets across gaps at the configured duration boundary. Scheduler cadence and
provider eligibility remain operational/data-validity concerns. There is no
hidden inactivity confirmation count or resolution threshold. Verdict: **no
missing inactivity setting**.

### Trips, stops, distance, and daily activity

Trip movement speed, movement confirmation, stop confirmation, and data-gap
behavior are all read through the typed policy service. Production analytics
and the fleet activity report pass the current database policy; historical
analytics intentionally recompute under current policy. Equal default values
for stop confirmation and data-gap handling are deliberately separate
semantics.

The 500 m daily-distance setting is used for dashboard qualification. No second
hidden minimum run/segment distance or noise threshold was found. Provider run
source and quality are provenance, not a missing business threshold. Verdicts:
**no missing trip/stop or daily-distance setting**.

### Freshness

Dashboard, fleet map, and vehicle details all read the persisted freshness
setting and expose fresh/stale/missing/unknown states. Alert ingestion does not
replace that user-visible policy with it: it uses provider `valid`/`outdated`
eligibility and the shared 60-second future-skew safety guard. That is an
intentional separation between product freshness and provider data validity.
The fixed Kyiv display/input paths are presentation/legacy contracts, not
calendar-policy consumers. Verdict: **business freshness is consistently
reached; no missing freshness setting**.

### History and track

Exact track is limited to 24 hours and 10,000 points; overview to 7 elapsed days
and 2,000 selected points. Overview segmentation breaks on a 300-second raw
gap, independently of the trip data-gap policy. Query transaction timeouts,
sampling caps, backfill windows, row/window caps, durable-run budgets, leases,
and poll intervals are API/worker/provider/storage controls, not normal fleet
Settings.

The active history horizon and retention age are currently 90 absolute days.
Retention also has bounded checkpoint/observation budgets and batch sizes.
Retention is best kept as an **operator/storage code policy** now: it has
storage-cost, privacy, destructive-execution, and deployment-wide implications,
and a fleet owner should not casually delete or retain shared history from the
ordinary business Settings UI. If the product later requires per-fleet legal
or contractual retention, that is a deliberate product/schema stage, not a
magic-number patch.

### Alert pipeline

Detector confirmation/window semantics are covered by A settings. Alert-event
optimistic attempts, transaction timeouts, notification leases, retry backoff,
maximum age, maximum attempts, batch sizes, and worker intervals are queue,
concurrency, provider, or operational controls (E/G/H). No queue mechanic was
mistaken for a business alert threshold.

### Telegram 2A–2D

Telegram linking has a 10-minute one-time token, five-link-attempts-per-ten-
minutes limiter, private-chat and webhook protocol constraints, and bounded bot
transport/retry behavior. These are H/G/security/provider controls. Telegram
2B adds exactly the B preferences in the per-user inventory; 2C adds
recipient-aware authorization rechecks and queue mechanics; 2D adds a cutover
boundary/gates. No new Telegram business threshold or magic-number debt was
introduced. Legacy global `telegramChatId` and the unused daily report minute
are not consumed.

### Provider, sync, scheduler, and environment

eQuGPS request/run timeouts and provider field/mode semantics remain at the
provider boundary. Fleet/runs sync intervals, shutdown timeout, database pool
and timeouts, feature gates, and Telegram dispatch cadence are already ENV or
deployment configuration. History maintenance and retention scheduling is
application-owned operational work: maintenance/retention cron and durable-run
timers are not ordinary user/admin settings. Backups and monitor reminder
thresholds remain ops-owned.

### API limits, security, validation, defaults

Track ranges, point caps, map/list limits, report range, polling, and debounce
values are product/API/UX limits. Session, login, password, token, rate-limit,
future-skew, body-size, GeoJSON, and validation bounds are security/safety or
protocol invariants. A central persisted setting default is authoritative; a
test fixture or pure-core default is not automatically a missing setting.

## Missing business settings: C and D only

**C: none. D: none.** Therefore there is no exact missing business question,
scope, UI location, type/unit, safe default, validation range, runtime migration
list, DB migration, or backward-compatibility impact to specify. No new setting
should be implemented from this audit.

## Operational/configuration gaps: E only

There is no must-fix operational configuration gap found. The meaningful ENV
controls already have parsers, bounds, and deployment ownership.

Nice-to-have, only if operational evidence later shows a need:

- make durable-run lease/heartbeat/poll timing an explicit deployment config;
- make the product Telegram transport timeout an operator/provider setting;
- separate hard-coded monitor reminder/request thresholds into ops config.

Leave alone: SQL transaction timeouts, retention and backfill budgets, provider
window/retry caps, and API result limits. These are bounded safety/storage or
contract decisions, not knobs to expose casually or to turn into a global
business-settings row.

## Intentional constants that should not become normal settings

- F: millisecond/second/day conversions, Earth-radius distance arithmetic,
  point-in-polygon calculation details, and absolute-day history arithmetic.
- G: future-position skew, auth session/token and password profile, login
  limiter, request-body and validation bounds, and destructive-operation limits.
- H: eQuGPS response/protocol semantics, Telegram private-chat/link-token and
  webhook rules, HTTP/provider status handling, and external transport timeout
  behavior.
- I: track windows/point caps, map/list pagination caps, report range, polling,
  debounce, and the documented legacy Kyiv display/input contract.
- J: test fixtures and offline research/probe values.

## Configuration-consistency defects and remediation

These are separate from C/D missing settings.

| ID | Finding | Status/action | Priority |
|---|---|---|:---:|
| CC-1 | `dashboard-client.tsx` falls back to `data.timezone || "Europe/Kyiv"`; the API contract requires and supplies a server timezone. | Remove the duplicate business fallback and rely on the parsed server field. Runtime change intentionally deferred. | P2 |
| CC-2 | Overview segmentation uses 300 seconds in backend SQL/service and Web presentation. | Establish one shared/API-owned segment-boundary contract or return authoritative boundaries; do not create an ADMIN setting. Runtime change intentionally deferred. | P2 |
| CC-3 | Stage 6A documentation says there is no edit endpoint/UI and no HTTP geofence write endpoint, while current `PATCH /api/admin/settings` accepts `cityGeofenceGeoJson` and the Web form shows a read-only summary. | This audit is authoritative; the old document is marked historical. Decide and document whether the privileged API path is the supported geometry write surface. | P2 |
| CC-4 | The 90-day history horizon/retention policy is repeated in server code, Web `z.literal(90)`, UI fallback, and fixtures. | Keep it operator/code-owned for now, but remove contract-level drift risk when history policy is next touched. | P3 |
| CC-5 | Pure trip/stop default `{5,60,300,300}` duplicates Prisma defaults. | Keep for isolated core/test callers; preserve the invariant that production services/reports inject `TripStopAnalyticsPolicy`. | P3 |

No setting consumer was found to bypass the central source in a production
business path. Frontend validation bounds duplicate backend bounds as normal
defense in depth; the server remains authoritative and this is not a missing
setting.

## Historical analytics semantics

Alert event records preserve event-time threshold/confirmation snapshots for
history and notifications. Trip/stop analytics and fleet activity reports
intentionally resolve one current global policy for the requested analysis and
recompute historical results under that current policy. The repository's
current services use that rule consistently; old records are not a reason to
invent historical per-event copies of trip/stop policy.

## Reconciliation of prior audit candidates

No standalone previous `magic-number` or `configurability` audit document was
found in the current tree or Git history. The prior audit's available historical
inputs were the roadmap, Stage 6A/6A.2 alert-rule document, the global-settings
commits, and the trip/stop and Telegram stage commits. Their candidate families
are all accounted for here:

| Historical candidate family | Original/stage decision reconstructed | Current implementation | Current status/action |
|---|---|---|---|
| Alert speed limits, tolerance, confirmations | Move business alert policy into global settings | A rows 4–8; detector and replay read the settings | Closed; retain |
| Inactivity distance/duration/enablement | Move business inactivity policy into global settings | A rows 9–11; detector reads typed context | Closed; retain |
| Timezone and daily-distance qualification | Centralize shared business calendar/qualification values | A rows 1–2; dashboard/report consumers read DB | Closed; dashboard fallback is CC-1 |
| Position freshness | Centralize user-visible freshness policy | A row 3; dashboard/map/details read DB | Closed; provider safety remains separate |
| City geofence | Persist and validate nullable Polygon, classify locally | A row 16; detector reads it; admin API accepts patch; Web summary is read-only | Business setting closed; CC-3 surface/docs decision remains |
| Trip/stop thresholds and data gaps | Migrate analytics/report core to typed global policy | A rows 12–15; service/report inject current policy | Closed; F row 38 is isolated-core fallback only |
| Telegram connection/preferences/delivery | Keep connection account-owned, content preferences user-owned, mechanics operational | B rows 17–21; E/H rows 23, 29–30, 47–49 | Closed; 2A–2D added no business debt |
| History/track limits and maintenance | Distinguish API/storage/provider controls from fleet business settings | E rows 31–35; I rows 50–59 | Closed as non-business; CC-2/CC-4 remain bounded cleanup |

## New post-audit code review

The post-audit feature set was explicitly checked: global settings foundation,
trip/stop migration, history maintenance/retention/monitoring, track overview,
reports, Telegram 2A linking, 2B preferences, 2C recipient planning/dispatch,
and 2D cutover. No new C or D candidate was introduced. The only new material
findings are the consistency/documentation items CC-1 through CC-4; Telegram's
new numbers are classified H/G/E as transport, security, or queue mechanics.

## Final ownership model

**GLOBAL — ADMIN:** timezone; daily-distance qualification; user-visible
freshness; speeding enablement/limits/tolerance/confirmation; inactivity
enablement/distance/duration; trip/stop movement/confirmation/data-gap policy;
and city geofence geometry through the supported privileged surface.

**PER USER:** Telegram master/type/vehicle-scope preferences; selected vehicle
IDs; and presentation locale. Telegram connection state remains account state.

**OPS/ENV:** feature gates, sync cadence, provider/database timeouts, worker
cadence and batch sizing, and deployment/monitoring controls.

**CODE/SECURITY/PROVIDER:** safety bounds, validity/skew checks, auth/link
security, protocol contracts, storage/retention policy, API caps, and UI
density/latency limits.

## Settings information architecture

No new group is required. Keep the existing ADMIN Settings information model:

- General: timezone, daily-distance qualification, position freshness.
- Speeding: enablement, city/outside limits, tolerance, confirmations.
- Inactivity: enablement, distance, duration.
- Trips & stops: movement speed, movement confirmation, stop confirmation, data
  gap.
- Geofence: current read-only summary until the API/UI geometry-write contract
  is deliberately settled.

Keep Account → Notifications separate for Telegram connection, notification
preferences, and vehicle scope. Keep operations/history maintenance controls
out of ordinary fleet business Settings.

## Completion record

- Runtime-code changes: **0**.
- Prisma/schema/migration changes: **0**.
- Production access or mutations: **0**.
- Documentation changes allowed by this stage: this authoritative audit,
  minimal roadmap status, and a historical-status clarification in the old
  Stage 6A document.
- Estimated remediation: one small implementation pass covering CC-1/CC-2,
  one documentation/API-surface decision for CC-3, and a bounded follow-up for
  CC-4/CC-5 when those modules are next changed; no new schema/settings stage.

The original requirement is therefore **not yet classified A** because the
bounded consistency backlog is real, but it does not require additional
business settings. After CC-1 through CC-3 close and CC-4/CC-5 are either
aligned or explicitly accepted, the requirement can be reclassified A.
