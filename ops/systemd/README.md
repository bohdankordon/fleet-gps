# Host backup scheduling (systemd timers)

These are source-controlled **examples** for a Linux/Docker Compose v2 host.
They are NOT installed or enabled automatically by the application.

## Layout

- `taxi-gps-backup-daily.service` / `.timer` - daily backup at 02:30 local.
- `taxi-gps-backup-weekly.service` / `.timer` - weekly backup Sunday 03:00 local.

Both invoke the Compose one-shot `backup` service from `compose.production.yaml`,
passing an explicit production env file and a backup tier. No secrets are stored
in these units; credentials come from `.env.production` on the host.

## Overlap protection

Both units, plus every pre-deploy and manual backup, invoke the same
`ops/backup-host.sh` entry point. It holds one host-level kernel lock file,
`/run/lock/taxi-gps-backup.lock`, guarded by `flock -n`. An overlapping run
exits nonzero and is recorded as a failed unit in the journal. The kernel
releases the lock if the process exits, is killed/crashes, or the host restarts;
the harmless lock file may remain, but no stale lock state survives.

## Installation (operator-only, not automated)

    sudo cp ops/systemd/taxi-gps-backup-*.service ops/systemd/taxi-gps-backup-*.timer /etc/systemd/system/
    sudo systemctl daemon-reload
    sudo systemctl enable --now taxi-gps-backup-daily.timer taxi-gps-backup-weekly.timer

Adjust `WorkingDirectory=/opt/taxi-gps` and the absolute wrapper path in each
service to the checkout path. Confirm `.env.production` exists there with
`BACKUP_DIR` pointing at a durable, off-repository host directory (see
`docs/backup-restore.md`).

## Manual run (also the pre-deploy backup gate)

    cd /opt/taxi-gps
    sh ops/backup-host.sh daily .env.production

Use that same command for the required pre-deploy backup. For the weekly tier,
replace `daily` with `weekly`.
