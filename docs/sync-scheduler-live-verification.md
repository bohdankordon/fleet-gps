# Live scheduler verification

`npm run sync-scheduler:live-smoke` is a manual operational check, not a test or a normal safe smoke. It performs real eQuGPS requests and PostgreSQL writes, so it requires both exact process-only opt-ins:

```powershell
$env:ALLOW_REAL_EQUGPS_REQUESTS = "true"
$env:ALLOW_DATABASE_WRITES = "true"
```

The smoke loads the root `.env` with the project loader but never writes it. It enables the scheduler and sets its fleet/runs intervals to `60/60` seconds only in the current process. The first jobs therefore run after a full interval; the smoke closes the application as soon as both complete, before the second runs cycle.

It uses the compiled API only, checks health, scheduler status and the cached dashboard response, and blocks any outbound origin other than the configured official and web eQuGPS origins. Scheduler status is memory-only and resets when the process exits.

Run this tool manually only. Ordinary tests and safe smokes remain offline/safe and do not enable the scheduler or make real eQuGPS requests.
