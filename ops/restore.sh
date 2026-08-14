#!/bin/sh
set -eu

# Stage 22 restore (PostgreSQL 17 pg_restore).
# Safe default: verify the checksum first, then restore into a fresh/empty
# target. Refuses a non-empty target unless --allow-non-empty is passed.

BACKUP_FILE=""
TARGET_DB=""
ALLOW_NON_EMPTY=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --backup) BACKUP_FILE="${2:-}"; shift 2 ;;
    --target-db) TARGET_DB="${2:-}"; shift 2 ;;
    --allow-non-empty) ALLOW_NON_EMPTY=1; shift ;;
    --help) echo "usage: restore.sh --backup FILE --target-db DB [--allow-non-empty]" >&2; exit 0 ;;
    *) echo "restore: unknown argument: $1" >&2; exit 1 ;;
  esac
done

: "${BACKUP_FILE:?restore: --backup is required}"
: "${TARGET_DB:?restore: --target-db is required}"
: "${PGHOST:?restore: PGHOST is required}"
: "${PGUSER:?restore: PGUSER is required}"
: "${PGPASSWORD:?restore: PGPASSWORD is required}"

case "$TARGET_DB" in
  ''|*[!A-Za-z0-9_]*) echo "restore: --target-db must be a simple identifier" >&2; exit 1 ;;
esac

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
. "$SCRIPT_DIR/lib/backup-common.sh"

# 1. Verify checksum FIRST. A mismatch refuses before pg_restore is invoked.
if ! backup_verify "$BACKUP_FILE"; then
  echo "restore: checksum verification failed; refusing to restore" >&2
  exit 1
fi

# 2. Determine target state.
db_exists="$(psql -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$TARGET_DB'")"
if [ -n "$db_exists" ]; then
  table_count="$(psql -d "$TARGET_DB" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'")"
  if [ "$table_count" != "0" ] && [ "$ALLOW_NON_EMPTY" != "1" ]; then
    echo "restore: target database '$TARGET_DB' already contains application objects; refusing by default" >&2
    echo "restore: pass --allow-non-empty ONLY for an explicit operator-controlled destructive restore" >&2
    exit 1
  fi
else
  createdb --owner="$PGUSER" "$TARGET_DB"
fi

# 3. Restore into the fresh/empty target.
if ! pg_restore --no-owner --no-privileges --exit-on-error --dbname="$TARGET_DB" "$BACKUP_FILE"; then
  echo "restore: pg_restore failed (target may be partially populated; discard it and retry into a fresh target)" >&2
  exit 1
fi

# 4. Post-restore sanity: Prisma migration state must be present.
migration_count="$(psql -d "$TARGET_DB" -tAc "SELECT count(*) FROM _prisma_migrations")"
echo "restore: completed; prisma migrations present: $migration_count"
