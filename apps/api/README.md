# NestJS API workspace

## Alert rule settings

Stage 6A.1 exposes read-only `GET /api/system/alert-settings`. Its business rules are stored in the PostgreSQL `ApplicationSettings` singleton, not in `.env`: `50/90/10/2/300/60` for city/outside limits, tolerance, confirmation updates, inactivity distance, and inactivity duration. Effective speed thresholds are calculated on every read (defaults: `60/100`), and settings are not cached so a later UI update needs no restart. The nullable GeoJSON Polygon city geofence is currently unconfigured; there is no detector, Telegram integration, or edit endpoint yet. See [`docs/alert-rule-settings.md`](../../docs/alert-rule-settings.md).

## City geofence

Stage 6A.2 adds read-only `GET /api/system/city-geofence` and a pure local GeoJSON Polygon classifier. Positions are `[longitude, latitude]`; holes and boundaries are supported. Boundary is deliberately the conservative `CITY` speed zone, while null geometry and invalid GPS points are `UNKNOWN`, never outside-city. The planar algorithm is a city-scale MVP tradeoff; runtime uses no geofence network service or PostGIS. A future authenticated UI will use the internal management service; there is no HTTP write endpoint now.

Use `npm run city-geofence:import -- --file <path> --dry-run` to validate a local raw Polygon without database initialization. Only explicit `--apply` can write, and `--clear --apply` clears it. No real Vinnytsia Polygon, source, license, or checksum has been added. Run `npm run city-geofence:smoke` separately for the compiled read-only runtime smoke.

## Scheduler

The in-memory scheduler is disabled by default. When enabled, fleet runs every 60 seconds and daily runs every 300 seconds, with no immediate execution or retry. The read-only `GET /api/system/sync-status` endpoint is intended only for localhost or a closed network; multi-replica deployments need a distributed lock or queue.

For a manual, opt-in production-credential verification of the compiled scheduler, see [`docs/sync-scheduler-live-verification.md`](../../docs/sync-scheduler-live-verification.md). It is not part of tests, builds, or safe smokes.

## Read-only Dashboard API

Этап 3C добавляет `GET /api/dashboard/vehicles`. Endpoint читает только локальный PostgreSQL-кэш, не запускает синхронизацию и не обращается к eQuGPS. До появления пользовательской авторизации он предназначен только для локальной или закрытой сети.

На этапе 1E backend подключает `@taxi-gps/equgps` только через `EquGpsModule` и `EquGpsGatewayService`. Gateway скрывает session token и отдельные capability-клиенты. Клиенты создаются лениво: запуск приложения и `GET /api/health` не выполняют внешних запросов. Публичные fleet endpoint на этом этапе отсутствуют.

Этап 2A добавляет локальный PostgreSQL и Prisma schema/migrations, но Prisma ещё не зарегистрирована в NestJS: запуск и health-check не открывают DB-соединение. Команды базы описаны в `docs/database.md`.

Этап 2B добавляет `DatabaseModule`: один lazy Prisma Client с `PrismaPg` adapter на backend-процесс. `/api/health` остаётся liveness без PostgreSQL, а `/api/health/ready` проверяет readiness. Controllers и application services не должны использовать `DatabaseService.getClient()` напрямую: это граница только для будущих infrastructure repositories.
# FleetModule

`FleetModule` — внутренний модуль ручной синхронизации локального кэша машин и их последнего состояния. Он не публикует HTTP endpoint и не запускает синхронизацию при startup. Синхронизация использует только официальный gateway, а отсутствие позиции не стирает последнюю известную позицию.

# DashboardModule

`DashboardModule` вручную синхронизирует текущий дневной пробег из web API `/runs` в PROVISIONAL `DailyVehicleStat`. Отсутствие run не создаёт нулевую статистику, а EXACT-записи не перезаписываются.

Для `/runs` composition root задаёт отдельный timeout 45 секунд через `EQUGPS_RUNS_TIMEOUT_MS`; общий timeout других eQuGPS endpoint остаётся 15 секунд. Timeout не вызывает retry и не меняет текущий дневной кэш.
