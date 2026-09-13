# Web scheduler status

Dashboard shows the read-only scheduler state through the fixed Next.js BFF route `GET /api/system/sync-status`. The browser never calls Nest directly and never receives `API_INTERNAL_BASE_URL`.

The status card is informational only. “Обновить состояние” rereads the status; it does not start synchronization. A disabled scheduler is displayed as disabled, not as an error. If status cannot be read, the vehicle dashboard remains available and the card shows a generic safe error.

Scheduler counters and timestamps are in-memory backend state and reset after a backend restart. The endpoint requires an authenticated account with `fleet.view`; Nest authorization remains authoritative.

`npm run scheduler:observe` is a separate read-only local observer for an already running Next dashboard. It uses only fixed Next BFF routes and is excluded from normal tests, builds, CI, smokes, and startup. See [local scheduler operation](local-scheduler-operation.md).
