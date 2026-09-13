# Backup and restore operations

Stage 22 backup/restore uses PostgreSQL 17 client tooling inside the official
postgres:17-alpine image, driven by Docker Compose one-shot jobs. No backup
scheduler lives in Nest: scheduling is host-level (systemd timers).

## Scope and format

Backups are logical database dumps of the COMPLETE application database:

    pg_dump -Fc --no-owner --no-privileges --dbname=<db>

    - custom format (-Fc)
    - all application schemas/tables/data, including the Prisma migration state
      (_prisma_migrations)
    - not a selected subset of business tables

PostgreSQL cluster-global roles and tablespaces are infrastructure and are
intentionally NOT treated as application database contents; the application
database user/database are recreated from .env.production on a fresh server.

## Location and off-host copy

BACKUP_DIR is an explicit, durable host directory mounted into the one-shot
backup container. Backups are never stored in ephemeral container layers and
never in the Git repository.

A backup that exists only on the same production machine is NOT sufficient
disaster recovery. The operator MUST maintain an encrypted, off-host copy.
Stage 22 does not implement S3/Backblaze/cloud upload.

## Naming, atomicity and permissions

Files use UTC timestamps:

    taxi-gps-YYYY-MM-DDTHHMMSSZ.dump
    taxi-gps-YYYY-MM-DDTHHMMSSZ.dump.sha256

Atomicity sequence (ops/backup.sh):

    1. umask 077; directory 0700, files 0600 where the platform permits
    2. pg_dump to a temporary file in the same backup filesystem
    3. require pg_dump success
    4. compute SHA-256 over the completed dump
    5. create both final names with atomic no-clobber links only after both
       temporary artifacts are complete
    6. verify the finalized checksum before reporting success

An existing finalized name is never overwritten. If the second finalization
step fails, the just-created first final artifact is removed. If backup or
finalization fails, no valid-looking final pair is left behind, previous valid
backups are NOT pruned, the job exits nonzero, and no DB mutation occurs.

## Integrity (SHA-256)

Every completed dump has a matching .sha256. Verify with:

    sh ops/backup-verify.sh <path-to>.dump

A checksum mismatch must FAIL: do not restore and do not continue a pre-deploy
migration when verification fails.

Verification accepts exactly one managed sidecar record. Its filename must be
the exact selected dump basename, its hash must be 64 hexadecimal characters,
and both dump and sidecar must be regular non-symlink files. Foreign filenames,
absolute/traversal paths, extra records, malformed hashes, and a hash mismatch
all fail before `pg_restore` can run. The complete sidecar bytes must be exactly
`<hash><two spaces><selected basename><newline>` followed immediately by EOF;
trailing unterminated bytes, blank lines, comments, spaces, and extra records
are rejected.

## Retention

Approved retention: 14 daily backups, 8 weekly backups, in daily/ and weekly/
subdirectories under BACKUP_DIR. `BACKUP_RETENTION_DAILY` and
`BACKUP_RETENTION_WEEKLY` default to those values; when explicitly configured,
each must be a strict positive decimal integer. The production preflight and
backup job reject zero, empty, signed, malformed, or leading-zero values before
`pg_dump`, finalization, or pruning. Pruning:

    - runs only AFTER a successful new backup
    - touches only strictly-managed .dump + .dump.sha256 pairs with exact
      managed filenames
    - never deletes unrelated files, malformed filenames, symlinks, or lone files
    - a failed backup performs zero pruning
    - a pruning operational failure preserves the newly finalized verified pair,
      exits nonzero, and never reports the backup as fully completed

## Scheduling (host-level, systemd)

Source-controlled examples live in ops/systemd/. Daily, weekly, pre-deploy, and
manual backups all call `ops/backup-host.sh`, which runs the Compose one-shot job
with an explicit production env file. Its shared host kernel lock
(`/run/lock/taxi-gps-backup.lock`, guarded by `flock -n`) prevents overlap; an
overlapping run fails visibly. Kernel locks release automatically on normal
exit, kill/crash, or host restart, so no persistent application-created lock
directory can permanently block the next backup. Install and enable units only
as an explicit operator action.

## Pre-deploy backup gate

The deployment sequence (docs/deployment.md) requires a verified backup BEFORE
any Prisma migration:

    sh ops/backup-host.sh daily .env.production

    1. run backup
    2. require success
    3. verify checksum
    4. only then run the one-shot migration

Do not silently migrate first. This is an explicit operational gate.

## Restore

Restore uses PostgreSQL 17 pg_restore into an explicit target database. It
verifies the checksum FIRST and refuses on mismatch before pg_restore runs:

    docker compose -f compose.production.yaml --env-file .env.production \
      --profile restore run --rm restore \
      --backup /backups/daily/taxi-gps-....dump --target-db taxi_gps

Safe default: restore targets a fresh/empty database. If the target already
contains application objects, restore REFUSES by default. An explicit
--allow-non-empty flag is required for an operator-controlled destructive
restore; destructive restore is never the default.

A corrupted or truncated dump makes pg_restore exit nonzero (--exit-on-error);
no partial restore is reported as success and no automatic salvage is attempted.

## Disaster-recovery procedure

1.  Stop proxy/web/API (or otherwise stop application DB writers).
2.  Preserve incident state where possible.
3.  Provision a fresh empty PostgreSQL 17 volume/database.
4.  Validate the chosen backup checksum.
5.  Explicitly select the production target (--target-db, plus --allow-non-empty
    only where the disaster procedure requires overwriting a non-empty target).
6.  Restore into the fresh target.
7.  Validate schema / migration state (17 migrations).
8.  Start the API and verify readiness.
9.  Start/verify web and proxy.
10. Perform representative login/read checks.
11. Retain the incident/old volume until the operator decides disposal.

## Restore drill contract

Acceptance proves, on fully disposable resources:

    - valid checksum required; wrong checksum rejected before pg_restore
    - truncated/corrupted dump fails nonzero and is never reported as success
    - non-empty target refused by default; fresh target accepted
    - source database unchanged; restored migration state, table counts and
      deterministic data digests equal the source
    - no provider/Telegram/map request occurred
