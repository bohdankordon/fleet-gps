# Пакет eQuGPS

`@taxi-gps/equgps` — независимый фундамент будущих адаптеров официального и web API eQuGPS. На этапе 1B он содержит конфигурацию, нормализованные контракты, безопасные ошибки и in-memory управление session token; production HTTP-клиент отсутствует.

Исследовательский код из корневого `src/` намеренно не переносится.

Проверки:

```bash
npm run equgps:typecheck
npm run equgps:build
npm run equgps:test
```
