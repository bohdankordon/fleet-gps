# Web workspace

`@taxi-gps/web` — responsive Next.js dashboard. Браузер обращается только к Next.js BFF route `/api/dashboard/vehicles`; Next server использует server-only `API_INTERNAL_BASE_URL` для Nest API. Значение не передаётся в browser bundle.

Запуск для локальной разработки: `npm run web:dev`. Для production-проверки используйте `npm run web:build`; smoke `npm run web:dashboard-smoke` запускает временные локальные API и web процессы и останавливает их.

Dashboard читает только локальный кэш PostgreSQL. Отсутствующая дневная статистика остаётся «Нет данных», а не нулевым пробегом. Authentication, scheduler, карта, отчёты и Telegram пока не реализованы; доступ допустим только локально или в закрытой сети.
