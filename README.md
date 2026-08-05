# eQuGPS API research

## Monorepo и этап 1A

Репозиторий использует npm workspaces: исследовательский TypeScript-код остаётся в корневом `src/`, минимальный NestJS backend находится в `apps/api`, а `apps/web`, `packages/equgps` и `packages/shared` пока являются placeholder-каталогами.

Research probes продолжают запускаться прежними командами `npm run api:*`. NestJS API запускается командой `npm run api:dev`; health endpoint доступен по `GET /api/health` на `127.0.0.1:3000` (порт можно задать через `PORT`). Для краткой локальной проверки без долгоживущего процесса: `npm run api:health-smoke`.

Текущие ограничения этапа 1A: без frontend, базы данных, Prisma, Docker, Telegram, scheduler и интеграции eQuGPS внутри NestJS.

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
