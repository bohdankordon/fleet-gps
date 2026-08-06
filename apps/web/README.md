# Web workspace

`@taxi-gps/web` is the responsive Next.js dashboard. The browser calls only fixed Next.js BFF routes; the Next server uses server-only `API_INTERNAL_BASE_URL` for Nest API access, so the internal backend URL is not included in the browser bundle.

The scheduler status UI is implemented at `/`: it reads the read-only `/api/system/sync-status` BFF route. “Обновить состояние” only rereads state and never starts synchronization. A disabled scheduler is a normal state; failed status loading does not prevent the dashboard from rendering.

For local development use `npm run web:dev`; for production validation use `npm run web:build`. `npm run web:dashboard-smoke` starts temporary local API and web processes and shuts them down.

The dashboard reads only the local PostgreSQL cache. Authentication, map, reports and Telegram are not implemented yet; until authentication exists, access is limited to localhost or a closed network.
