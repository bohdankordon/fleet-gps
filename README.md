# eQuGPS API research

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
