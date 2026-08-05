# eQuGPS API research

## Этап 2A: локальная БД

Локальный PostgreSQL запускается через `npm run db:up`; Prisma 7 schema и миграции находятся в `apps/api/prisma`. На этом этапе Prisma ещё не подключена к NestJS startup, поэтому `GET /api/health` не обращается к БД. Подробности и безопасные команды — в `docs/database.md`.

## Monorepo и этап 1A

Репозиторий использует npm workspaces: исследовательский TypeScript-код остаётся в корневом `src/`, минимальный NestJS backend находится в `apps/api`, а `apps/web`, `packages/equgps` и `packages/shared` пока являются placeholder-каталогами.

Research probes продолжают запускаться прежними командами `npm run api:*`. NestJS API запускается командой `npm run api:dev`; health endpoint доступен по `GET /api/health` на `127.0.0.1:3000` (порт можно задать через `PORT`). Для краткой локальной проверки без долгоживущего процесса: `npm run api:health-smoke`.

Этап 2A завершён: PostgreSQL запускается через Compose, а Prisma schema и versioned migrations находятся в `apps/api/prisma`. Prisma пока не является Nest provider. Frontend, Telegram и scheduler всё ещё не реализованы.

Минимальный диагностический TypeScript-клиент для безопасной проверки `GET /devices` eQuGPS API. Клиент выполняет только GET-запросы и не изменяет данные.

## Требования

- Node.js 24.x;
- npm.

## Установка и запуск

```bash
npm install
Copy-Item .env.example .env
```

Заполните в `.env` как минимум `EQUGPS_EMAIL` и `EQUGPS_PASSWORD`; при необходимости измените URL, часовой пояс и таймаут.

Проверить конфигурацию без обращения к сети:

```bash
npm run api:config
```

Выполнить безопасную проверку списка устройств:

```bash
npm run api:devices
```

Также доступны `npm run typecheck` и `npm run build`.

## Безопасность

- Используется только `GET /devices` с HTTP Basic Auth.
- Скрипт выводит только `id`, `name`, `status`, `lastUpdate` и `groupId`.
- В вывод не попадают `uniqueId`, телефон, contact, attributes, email, пароль, токены и заголовок `Authorization`.
- Не добавляйте `.env` в Git: он уже исключён в `.gitignore`.
