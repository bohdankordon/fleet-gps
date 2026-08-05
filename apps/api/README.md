# NestJS API workspace

На этапе 1E backend подключает `@taxi-gps/equgps` только через `EquGpsModule` и `EquGpsGatewayService`. Gateway скрывает session token и отдельные capability-клиенты. Клиенты создаются лениво: запуск приложения и `GET /api/health` не выполняют внешних запросов. Публичные fleet endpoint на этом этапе отсутствуют.

Этап 2A добавляет локальный PostgreSQL и Prisma schema/migrations, но Prisma ещё не зарегистрирована в NestJS: запуск и health-check не открывают DB-соединение. Команды базы описаны в `docs/database.md`.

Этап 2B добавляет `DatabaseModule`: один lazy Prisma Client с `PrismaPg` adapter на backend-процесс. `/api/health` остаётся liveness без PostgreSQL, а `/api/health/ready` проверяет readiness. Controllers и application services не должны использовать `DatabaseService.getClient()` напрямую: это граница только для будущих infrastructure repositories.
# FleetModule

`FleetModule` — внутренний модуль ручной синхронизации локального кэша машин и их последнего состояния. Он не публикует HTTP endpoint и не запускает синхронизацию при startup. Синхронизация использует только официальный gateway, а отсутствие позиции не стирает последнюю известную позицию.
