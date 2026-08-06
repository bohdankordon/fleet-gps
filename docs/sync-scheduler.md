# Sync scheduler

The scheduler is disabled by default. Fleet synchronization runs every 60 seconds and daily runs synchronization every 300 seconds when enabled. The first synchronization starts only after a full interval; failed jobs have no immediate retry.

Fleet and runs use independent overlap locks. Their status is in memory only and resets on restart. Shutdown waits for active work for at most the configured timeout (50 seconds by default); after a forced timeout, late completions do not update status.

The scheduler calls the existing sync services and has no manual sync HTTP endpoints. MVP requires one active backend replica; multiple replicas need a distributed lock or queue. `GET /api/system/sync-status` is read-only and must be available only on localhost or a closed network.

`npm run sync-scheduler:live-smoke` is a separate manual live verification. It requires two exact opt-ins, uses real eQuGPS requests and database writes, and applies 60-second fleet/runs intervals only in its process. It never changes `.env`; details are in [live scheduler verification](sync-scheduler-live-verification.md).
