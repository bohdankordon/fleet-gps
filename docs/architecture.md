# Архитектура первой версии

## Alert rule settings

`AlertSettingsModule` is a read-only PostgreSQL boundary around the `ApplicationSettings` singleton. It validates database values as untrusted, returns an immutable snapshot, and does not query on application bootstrap. `GET /api/system/alert-settings` is the future UI read contract; it neither writes, starts a detector, nor calls eQuGPS. Rule defaults `50/90/10/2/300/60` live in the database migration, while effective speed thresholds are calculated at read time. The optional city geofence is a validated GeoJSON Polygon JSON value without PostGIS and is currently `null`; detector cycles will later read one snapshot per batch.

`CityGeofenceModule` adds an isolated pure planar Polygon classifier and a separate speed-zone policy. It uses GeoJSON `[longitude, latitude]`, supports holes and boundaries, and maps a boundary to `CITY`; `null` means `UNCONFIGURED`, never outside city. Geometry has no NestJS, Prisma, I/O, eQuGPS, or environment dependency. The runtime rereads the immutable settings snapshot per call, while the internal management service shares alert-settings validation for a future authenticated UI. Its only HTTP surface today is read-only `GET /api/system/city-geofence`; controlled local import requires explicit apply and does no network lookup. The offline Vinnytsia candidate Polygon, source/license/checksum, and control points are present in the repository, but are not automatically read at runtime or imported; ApplicationSettings.cityGeofenceGeoJson remains null and --apply has not been run. No detector, event, or notification is present.

## Sync scheduler

The scheduler is disabled by default and runs fleet/runs only after their full 60/300-second intervals. It keeps independent in-memory locks and status, uses bounded shutdown, and provides read-only status only on localhost or a closed network. MVP requires one active backend replica; multiple replicas need a distributed lock or queue.

Stage 15A adds an operator-only trip/stop analytics path: CLI → database-only analytics service → read-only position repository → pure deterministic state machine. It derives results on demand for one public vehicle UUID and an explicit range of at most seven absolute days. Provider speed supplies movement/stopped evidence; raw gaps remain unknown, and Haversine distance is explicitly GPS-observed. The module is outside `AppModule`, provider modules, schedulers, public HTTP, and frontend, and creates no persisted analytical entity or database write. See [trip-stop-analytics.md](trip-stop-analytics.md).

## Read-only Dashboard API

На этапе 3C `DashboardModule` публикует локальный read-only список машин. Controller и query service читают только PostgreSQL-кэш и не вызывают eQuGPS или синхронизацию. Список не выдаёт координаты и внешний device ID. До реализации auth endpoint разрешён только локально либо в закрытой сети.

## Web dashboard

Scheduler state follows the same boundary: Next BFF owns the fixed read-only `/api/system/sync-status` route, validates the backend contract, and emits only safe errors. Browser code has no internal backend URL. Scheduler state remains in-memory and reset-on-restart; access is local/closed-network until auth is introduced.

Next.js frontend из `apps/web` является единственной browser-границей. Browser обращается к ограниченному BFF route Next.js; только Next server вызывает Nest API по server-only internal URL. Внешний API eQuGPS не доступен frontend и не вызывается пользовательским HTTP-запросом dashboard.

## Интеграционная граница eQuGPS

Backend использует workspace `@taxi-gps/equgps` через NestJS `EquGpsModule`. Единственная экспортируемая граница модуля — `EquGpsGatewayService`; frontend, controllers и будущие доменные модули не получают transport, отдельные capability-клиенты или session token. Session создаётся лениво только при первом web-вызове и разделяется между capabilities. Startup и health-check не вызывают внешний API. Публичные fleet endpoint пока отсутствуют; dashboard-list читает только локальный кэш.

## Локальное хранилище

PostgreSQL и Prisma 7 используют отдельные schema/migrations артефакты. Prisma подключена к `AppModule` только через не-global `DatabaseModule`; liveness не выполняет SQL.

`DatabaseModule` является явной (не global) backend-зависимостью. Он создаёт один lazy Prisma Client с PostgreSQL adapter; readiness отделён от liveness. Правило одной активной backend-реплики MVP сохраняется.

## Стек

- Node.js 24, TypeScript в строгом режиме и npm workspaces;
- backend: NestJS;
- responsive frontend: Next.js;
- PostgreSQL и Prisma;
- фоновые задачи: NestJS Schedule;
- Telegram: grammY и Telegram Bot API;
- отчёты: Playwright для PDF, ExcelJS для XLSX;
- локальная и production-оркестрация: Docker Compose.

Redis и PostGIS намеренно не входят в первую версию. Их необходимость будет оцениваться по фактической нагрузке и требованиям к геообработке.

## Будущая структура monorepo

```text
apps/
  api/
  web/
packages/
  equgps/
  shared/
docs/
```

Существующий исследовательский код пока остаётся на текущем месте и не перемещается. В этапе внедрения адаптеры eQuGPS будут перенесены в `packages/equgps` с сохранением проверенных правил безопасности.

## Backend-модули

- `auth` — аутентификация и авторизация пользователей;
- `users` — пользователи и роли;
- `equgps` — изолированные адаптеры официального и web API, сессии и нормализация;
- `fleet` — машины и их связь с внешними устройствами;
- `dashboard` — агрегаты оперативного состояния;
- `trips` — поездки, стоянки и маршруты;
- `violations` — выявление и хранение превышений;
- `reports` — PDF/XLSX и ежедневные отчёты;
- `telegram` — интерфейсы отправки сообщений, документов и уведомлений;
- `scheduler` — планирование polling и отчётов;
- `settings` — настраиваемые пороги, расписания и timezone;
- `health` — проверки работоспособности;
- `audit` — безопасный аудит действий приложения.

Зависимости направлены к доменным модулям и адаптерам: `dashboard`, `trips`, `violations` и `reports` используют публичные интерфейсы `fleet`, `equgps`, `settings` и `telegram`, но не внутренности друг друга. `scheduler` только запускает прикладные сценарии. `telegram` не содержит бизнес-расчётов.

Frontend обращается только к API backend. Прямой доступ Next.js или браузера к eQuGPS запрещён: он раскрыл бы учётные данные, session token и сделал бы контроль ошибок непредсказуемым.

## Операционная модель MVP

Основной кэш хранит агрегат по одной машине за один календарный день в `Europe/Kyiv`. Отчёт за произвольный период агрегирует дневные записи. Текущий неполный день обновляется, завершённые дни считаются кэшированными. Обращения к web API выполняются последовательно либо с явно ограниченной concurrency; неконтролируемый fan-out запрещён.

В MVP допускается только одна активная реплика backend. NestJS Schedule и grammY long polling запускаются только в одном процессе. Несколько реплик запрещены до появления distributed locking или очереди; будущими вариантами могут быть PostgreSQL advisory locks либо Redis/BullMQ, но они не входят в MVP.

До реализации пользовательской авторизации приложение доступно только локально или в закрытой сети. Публичное production-развёртывание запрещено до этапа `auth`; production readiness включает защиту всех API endpoint.

## Telegram

grammY является основным framework Telegram-бота и запускается внутри NestJS backend. Модуль `telegram` предоставляет интерфейсы отправки сообщений, документов и уведомлений; бизнес-модули не вызывают Telegram API напрямую. Токен бота загружается только из переменных окружения, не записывается в PostgreSQL и не попадает в логи. Для первой версии используется long polling; команды бота и автоматические отчёты реализуются отдельными сервисами. Переход на webhook должен быть возможен без переписывания модулей отчётов и уведомлений.
## Fleet cache

Backend хранит локальный кэш устройств и только последнего нормализованного состояния. `FleetModule` обращается к eQuGPS исключительно через `EquGpsGatewayService`; frontend и будущие controllers не получают прямого доступа к внешнему API. Полный GPS-трек не хранится.

## Daily dashboard statistics

`DashboardModule` изолирует ручную синхронизацию `/runs`. Она пишет только текущий календарный день configured timezone, не затрагивает Fleet state и применяет precedence `EXACT > PROVISIONAL > ESTIMATED`.

## Offline Vinnytsia city-boundary candidate

The data/geofences/vinnytsia-city dataset is a reviewed operational candidate: OpenStreetMap relation 361818 is a city administrative boundary, deliberately distinct from hromada relation 12411968. Metadata, ODbL attribution, checksum, and public control points are stored with the raw unsimplified Polygon. The verifier is offline and reuses production geometry and policy functions without initializing Nest, Prisma, or a database. This dataset is not loaded in runtime and has not been applied, so the database geofence remains null and no network dependency is introduced.
