# Web scheduler status

Dashboard shows the read-only scheduler state through the fixed Next.js BFF route `GET /api/system/sync-status`. The browser never calls Nest directly and never receives `API_INTERNAL_BASE_URL`.

The status card is informational only. “Обновить состояние” rereads the status; it does not start synchronization. A disabled scheduler is displayed as disabled, not as an error. If status cannot be read, the vehicle dashboard remains available and the card shows a generic safe error.

Scheduler counters and timestamps are in-memory backend state and reset after a backend restart. Until authentication is added, the endpoint must be available only locally or on a closed network.
