# Web workspace

`@taxi-gps/web` is the responsive Next.js dashboard. The browser calls only fixed Next.js BFF routes; the Next server uses server-only `API_INTERNAL_BASE_URL` for Nest API access, so the internal backend URL is not included in the browser bundle.

The scheduler status UI is implemented at `/`: it reads the read-only `/api/system/sync-status` BFF route. “Обновить состояние” only rereads state and never starts synchronization. A disabled scheduler is a normal state; failed status loading does not prevent the dashboard from rendering.

For a manually enabled local scheduler, `npm run scheduler:observe` observes only the fixed Next BFF routes and never starts a sync. See [local scheduler operation](../../docs/local-scheduler-operation.md).

For local development use `npm run web:dev`. The canonical standalone production flow is `npm run standalone:build`, then `npm start` (or `npm run standalone:start`) with `API_INTERNAL_BASE_URL`, `HOSTNAME`, and `PORT` supplied at runtime. The generated Next standalone server reads `HOSTNAME` and `PORT`; `API_INTERNAL_BASE_URL` remains a runtime-only server environment value. The build keeps MapLibre's generated same-origin worker modules in `public/maplibre`; standalone preparation copies `public` and `.next/static` into the generated deployment tree because Next standalone output does not include them automatically. No manual filesystem copy is needed. `npm run web:dashboard-smoke` starts temporary local API and web processes and shuts them down.

The dashboard reads only the local PostgreSQL cache. Authentication, map, reports and Telegram are not implemented yet; until authentication exists, access is limited to localhost or a closed network.

The vehicle `Поездки` section reads derived Stage 15A trip/stop analytics through a same-origin no-store BFF. Europe/Kyiv `Сегодня`/`Вчера`, rolling 24-hour/seven-day, and DST-strict custom ranges become explicit absolute requests. Its chronological timeline keeps GPS gaps separate; selected trips reuse the existing exact/overview track BFF and MapLibre rendering, while selected stops show only their persisted boundary fixes. It adds no browser provider access, routing, geocoding, persistence, or automatic history population.

Stage 15C adds the global `Отчёты` destination at `/reports?date=YYYY-MM-DD`. Today resolves from Kyiv midnight to the current instant; historical dates resolve to complete DST-aware Kyiv calendar days. Rows link to the existing Trips page with the exact report range. See [../../docs/fleet-daily-activity-report.md](../../docs/fleet-daily-activity-report.md).
