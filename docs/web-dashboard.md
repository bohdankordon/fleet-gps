# Web dashboard

## Scheduler status

The scheduler block uses only Next BFF `/api/system/sync-status`; the browser does not call Nest directly. It is read-only, and its refresh button does not start synchronization. A disabled scheduler is a normal state. Backend status is in-memory and resets after restart. Before auth, expose this route only locally or on a closed network.

Frontend расположен в `apps/web` и использует Next.js App Router. Браузер работает только с ограниченным Next.js BFF endpoint; server-only `API_INTERNAL_BASE_URL` применяется только на Next server для вызова Nest API. Ни браузер, ни Next route не обращаются к eQuGPS.

`/` отображает responsive dashboard: на desktop — таблицу, на mobile — карточки. Фильтры сохраняются в URL, поиск имеет debounce, предыдущий запрос отменяется. Обновление читает только локальный dashboard cache и никогда не запускает синхронизацию.

Отсутствующий `DailyVehicleStat` — это «Нет данных», не `0 км`. Freshness позиции вычислен backend по `fixTime`; source и quality показаны понятными labels. Список намеренно не содержит координаты, external device ID или UUID в интерфейсе.

Authentication пока отсутствует, поэтому запуск разрешён только локально либо в закрытой сети.
