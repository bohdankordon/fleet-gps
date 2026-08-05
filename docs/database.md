# Локальная база данных

PostgreSQL запускается только через `compose.yaml`: `postgres:17-alpine`, named volume `postgres_data` и публикация `127.0.0.1:5433`. Проверка конфигурации: `npm run db:config`; запуск: `npm run db:up`; состояние: `npm run db:ps`; остановка без удаления данных: `npm run db:down`.

`docker compose down -v` удаляет локальный volume с данными и намеренно не включён в штатные команды проекта.

Prisma-команды: `npm run db:format`, `db:validate`, `db:generate`, `db:migrate:dev`, `db:migrate:deploy`, `db:migrate:status`, `db:smoke`. `migrate dev` создаёт миграции локально, `migrate deploy` применяет уже версионируемые миграции. `db:smoke` выполняет только чтение.

Схема содержит `Vehicle`, `VehicleCurrentState`, `DailyVehicleStat` и singleton `ApplicationSettings` с `id=1`. `serviceDate` — календарная дата `Europe/Kyiv`; distance хранится в метрах, длительность — в секундах, скорость — в км/ч. `RUNS` обычно даёт `PROVISIONAL`, `MODE1` — `EXACT`, historical positions — `ESTIMATED`; это решение принимает будущий application service.

История всех GPS-точек, токены, пароли и сырые ответы eQuGPS в БД не хранятся.

На этапе 2B Prisma интегрирована через не-global `DatabaseModule`: в процессе существует один `PrismaClient` с `PrismaPg`, а соединение остаётся lazy до первого запроса. Nest lifecycle вызывает безопасный idempotent disconnect. Liveness `/api/health` не зависит от PostgreSQL; `/api/health/ready` выполняет отдельный ping. `DatabaseService.getClient()` предназначен только для infrastructure repositories, не для controllers или application services.
