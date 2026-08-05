# Пакет eQuGPS

`@taxi-gps/equgps` — независимый пакет адаптеров eQuGPS. Он использует нормализованные публичные типы, безопасные ошибки и in-memory управление session token. Конфигурацию передаёт composition root; package не читает окружение самостоятельно.

Реализованы только подтверждённые endpoint:

- официальный: `POST /session`, `GET /devices`, `GET /positions` и historical `GET /positions`;
- web: `POST /api/devices/runs`.

`FetchHttpTransport` использует встроенный Node.js `fetch`. Для unit-тестов factories принимают injected `HttpTransport`. Session token сохраняется только внутри `SessionTokenProvider`; публичные типы не возвращают raw transport responses, attributes или учётные данные.

Web capabilities `mode1`, `mode2` и `routes-new` намеренно ещё не реализованы. `WebRunsClient` выделен отдельно, чтобы не публиковать методы-заглушки.

Исследовательский код из корневого `src/` намеренно не переносится.

Проверки:

```bash
npm run equgps:typecheck
npm run equgps:build
npm run equgps:test
npm run equgps:public-api-smoke
```
