# Local scheduler operation

This is the manual procedure for a permanently enabled local scheduler. It does not mean the scheduler is already enabled on this machine. Scheduler jobs make real eQuGPS requests and PostgreSQL writes.

For this manual procedure, the port assignment is: Nest API is `http://127.0.0.1:3001`; Next Web and the observer default target are `http://127.0.0.1:3000`. `PORT` belongs to the Nest API. Next runs separately on port 3000. The browser calls Next only and never calls API port 3001 directly; Next uses `API_INTERNAL_BASE_URL` server-side. (The `dev.ps1` helper uses the opposite default assignment: API on 3000, Web on 3001. Do not run both schemes at once.)

Before starting, confirm PostgreSQL is available. Run exactly one API replica: multiple backend replicas are prohibited for the MVP. Do not run a development API and a compiled API at the same time. `.env` is local and must never be committed.

In the root local `.env`, set:

```dotenv
HOST=127.0.0.1
PORT=3001
API_INTERNAL_BASE_URL=http://127.0.0.1:3001
SYNC_SCHEDULER_ENABLED=true
FLEET_SYNC_INTERVAL_SECONDS=60
RUNS_SYNC_INTERVAL_SECONDS=300
SYNC_SCHEDULER_SHUTDOWN_TIMEOUT_MS=50000
```

## Terminal 1 — API

```powershell
Set-Location C:\Dev\taxi-gps
npm run equgps:build
npm run api:build
node --env-file=.env apps/api/dist/main.js
```

API runtime uses the compiled `@taxi-gps/equgps` package. After a clean checkout or a cleared `dist`, run `equgps:build` first; `api:build` then generates Prisma Client and builds the Nest API. `node --env-file=.env` explicitly loads the root `.env` into this API process. Do not use `npm run api:dev` for this operational verification.

## Terminal 2 — Web

```powershell
Set-Location C:\Dev\taxi-gps
$env:API_INTERNAL_BASE_URL = "http://127.0.0.1:3001"
npm run web:build
npm --workspace @taxi-gps/web run start -- -H 127.0.0.1 -p 3000
```

After Web exits, remove the terminal-only variable:

```powershell
Remove-Item Env:API_INTERNAL_BASE_URL -ErrorAction SilentlyContinue
```

Do not assume that Next automatically reads the root `.env`; the command sets the value for the Web process explicitly.

## Terminal 3 — observer

```powershell
Set-Location C:\Dev\taxi-gps
npm run scheduler:observe
```

`LOCAL_WEB_BASE_URL` is not needed with the standard Web port 3000. For a non-standard local Web port:

```powershell
$env:LOCAL_WEB_BASE_URL = "http://127.0.0.1:3100"
try {
    npm run scheduler:observe
}
finally {
    Remove-Item Env:LOCAL_WEB_BASE_URL -ErrorAction SilentlyContinue
}
```

Start the API before Web. The first fleet cycle is expected after about 60 seconds; the first runs cycle after about 300 seconds. The observer connects read-only to the already running Next application through fixed BFF routes only: it neither starts synchronization nor calls eQuGPS. Status is stored only in API memory, so an API restart resets counters. The UI refresh button only rereads status.

To disable the scheduler, set `SYNC_SCHEDULER_ENABLED=false` in local `.env` and restart the API. For graceful shutdown, use Ctrl+C and wait for API shutdown handling.

## Troubleshooting

- `errorType: configuration` / scheduler disabled: check the local enablement and intervals, then restart the API.
- `errorType: scheduler` / `startedAt` is null: verify API startup completed and exactly one API process is running.
- API and Web try to use one port: restore API `PORT=3001` and run Web with `-p 3000`.
- Observer reaches Nest instead of Next: use the default target or set `LOCAL_WEB_BASE_URL` to the Next port, never API `:3001`.
- Root `.env` was not loaded by the API process: launch compiled API with the documented `node --env-file=.env` command.
- `API_INTERNAL_BASE_URL` is missing in the Web process: set the Terminal 2 PowerShell environment variable before building and starting Web.
- Database unavailable: restore PostgreSQL availability before starting the API; scheduler jobs require database access.
- eQuGPS failure: inspect API logs locally, correct the upstream issue, then allow a later automatic cycle; observer does not retry or trigger a sync.
- `errorType: timeout`: a BFF request exceeded 10 seconds, or the full observation deadline elapsed; keep API and Web running and investigate their local logs.
- Duplicate API process: stop one process; only one backend replica is permitted for the MVP.
- UI shows old status after an API restart: refresh after API is available again; counters reset because status is memory-only.
