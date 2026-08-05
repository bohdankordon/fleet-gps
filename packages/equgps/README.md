# Пакет eQuGPS

Timeout по умолчанию для большинства endpoint — 15 секунд (`requestTimeoutMs`). Только read-only `/api/devices/runs` использует отдельный `runsRequestTimeoutMs` со значением по умолчанию 45 секунд: endpoint подтверждённо может отвечать медленнее. Timeout не запускает автоматический retry; при нём текущий дневной кэш не изменяется.

`@taxi-gps/equgps` — независимый пакет адаптеров eQuGPS. Он использует нормализованные публичные типы, безопасные ошибки и in-memory управление session token. Конфигурацию передаёт composition root; package не читает окружение самостоятельно.

Реализованы только подтверждённые endpoint:

- официальный: `POST /session`, `GET /devices`, `GET /positions` и historical `GET /positions`;
- web: `POST /api/devices/runs`.

Также реализованы read-only web capabilities: `mode1` для статистики дня, `mode2` для внешних событий скорости и `routes-new` для маршрута. `mode1` нормализует метры, секунды `goTime` и узлы `maxSpeed`; mode2 speed остаётся в км/ч. Opaque fields и nested route speed не публикуются.

`FetchHttpTransport` использует встроенный Node.js `fetch`. Для unit-тестов factories принимают injected `HttpTransport`. Session token сохраняется только внутри `SessionTokenProvider`; публичные типы не возвращают raw transport responses, attributes или учётные данные.

Все подтверждённые read-only web capabilities реализованы: `runs`, `mode1`, `mode2` и `routes-new`. Вложенная скорость `routes-new` намеренно не публикуется, поскольку её единица измерения ещё не подтверждена. Начальная и конечная координаты поездки пока возвращаются как `null`: порядок `startC`/`endC` не подтверждён. Package не содержит бизнес-логики правил «город/за городом».

Исследовательский код из корневого `src/` намеренно не переносится.

Проверки:

```bash
npm run equgps:typecheck
npm run equgps:build
npm run equgps:test
npm run equgps:public-api-smoke
```
