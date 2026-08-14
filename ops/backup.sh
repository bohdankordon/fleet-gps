#!/bin/sh
set -eu

# Stage 22 logical backup (PostgreSQL 17 pg_dump custom format, -Fc).
# Runs inside postgres:17-alpine via the Compose "backup" one-shot service.
# See docs/backup-restore.md for the operational contract.

BACKUP_TIER="${BACKUP_TIER:-daily}"
if [ "${BACKUP_RETENTION_DAILY+x}" = "x" ]; then BACKUP_RETENTION_DAILY="$BACKUP_RETENTION_DAILY"; else BACKUP_RETENTION_DAILY=14; fi
if [ "${BACKUP_RETENTION_WEEKLY+x}" = "x" ]; then BACKUP_RETENTION_WEEKLY="$BACKUP_RETENTION_WEEKLY"; else BACKUP_RETENTION_WEEKLY=8; fi
BACKUP_DIR="${BACKUP_DIR:-/backups}"

if [ "${1:-}" = "daily" ] || [ "${1:-}" = "weekly" ]; then
  BACKUP_TIER="$1"
fi

case "$BACKUP_TIER" in
  daily|weekly) ;;
  *) echo "backup: invalid BACKUP_TIER (expected daily or weekly)" >&2; exit 1 ;;
esac

: "${PGHOST:?backup: PGHOST is required}"
: "${PGUSER:?backup: PGUSER is required}"
: "${PGPASSWORD:?backup: PGPASSWORD is required}"
: "${PGDATABASE:?backup: PGDATABASE is required}"

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
. "$SCRIPT_DIR/lib/backup-common.sh"

# Validate both configured tiers before filesystem setup, timestamp generation,
# pg_dump, finalization, or pruning. Empty explicitly-set values are invalid.
backup_is_positive_retention "$BACKUP_RETENTION_DAILY" || { echo "backup: invalid BACKUP_RETENTION_DAILY" >&2; exit 1; }
backup_is_positive_retention "$BACKUP_RETENTION_WEEKLY" || { echo "backup: invalid BACKUP_RETENTION_WEEKLY" >&2; exit 1; }

umask 077

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR" 2>/dev/null || true

TIER_DIR="$BACKUP_DIR/$BACKUP_TIER"
mkdir -p "$TIER_DIR"
chmod 700 "$TIER_DIR" 2>/dev/null || true

TIMESTAMP="$(date -u +%Y-%m-%dT%H%M%SZ)"
FINAL_DUMP="taxi-gps-$TIMESTAMP.dump"
FINAL_SHA="taxi-gps-$TIMESTAMP.dump.sha256"
TMP_DUMP="$TIER_DIR/.tmp.$FINAL_DUMP.$$"
TMP_SHA="$TIER_DIR/.tmp.$FINAL_SHA.$$"
FINAL_DUMP_PATH="$TIER_DIR/$FINAL_DUMP"
FINAL_SHA_PATH="$TIER_DIR/$FINAL_SHA"
FINAL_DUMP_CREATED=0
FINAL_SHA_CREATED=0
BACKUP_COMPLETE=0

cleanup_backup() {
  rm -f "$TMP_DUMP" "$TMP_SHA"
  if [ "$BACKUP_COMPLETE" != "1" ]; then
    [ "$FINAL_SHA_CREATED" = "1" ] && rm -f "$FINAL_SHA_PATH"
    [ "$FINAL_DUMP_CREATED" = "1" ] && rm -f "$FINAL_DUMP_PATH"
  fi
}
trap cleanup_backup EXIT
trap 'exit 1' HUP INT TERM

# A timestamp collision or any pre-existing final path is a hard failure. Never
# overwrite an existing dump, checksum, symlink, directory, or partial pair.
if [ -e "$FINAL_DUMP_PATH" ] || [ -L "$FINAL_DUMP_PATH" ] || [ -e "$FINAL_SHA_PATH" ] || [ -L "$FINAL_SHA_PATH" ]; then
  echo "backup: finalized backup timestamp already exists" >&2
  exit 1
fi

# 1. Dump to a temporary file in the same backup filesystem (custom format).
if ! pg_dump -Fc --no-owner --no-privileges --dbname="$PGDATABASE" --file="$TMP_DUMP"; then
  echo "backup: pg_dump failed" >&2
  exit 1
fi

# 2. SHA-256 over the completed dump, recording the FINAL filename.
HASH="$(sha256sum "$TMP_DUMP" | awk '{print $1}')"
printf '%s  %s\n' "$HASH" "$FINAL_DUMP" > "$TMP_SHA"
chmod 600 "$TMP_DUMP" "$TMP_SHA"

# 3. No-clobber finalize. Hard-link creation is atomic and fails if the target
#    already exists. The EXIT trap removes a just-created incomplete final pair
#    if either finalization step fails.
if ! ln "$TMP_DUMP" "$FINAL_DUMP_PATH"; then
  echo "backup: dump finalization failed" >&2
  exit 1
fi
FINAL_DUMP_CREATED=1
rm -f "$TMP_DUMP"

if ! ln "$TMP_SHA" "$FINAL_SHA_PATH"; then
  echo "backup: checksum finalization failed" >&2
  exit 1
fi
FINAL_SHA_CREATED=1
rm -f "$TMP_SHA"
chmod 600 "$FINAL_DUMP_PATH" "$FINAL_SHA_PATH"

# 4. Verify the finalized pair before declaring success.
if ! backup_verify "$FINAL_DUMP_PATH"; then
  echo "backup: final checksum verification failed" >&2
  exit 1
fi

BACKUP_COMPLETE=1

# 5. Prune only AFTER a successful new backup. A failed backup (above) exits
#    before this point and can never prune previous valid backups.
if [ "$BACKUP_TIER" = "weekly" ]; then
  KEEP="$BACKUP_RETENTION_WEEKLY"
else
  KEEP="$BACKUP_RETENTION_DAILY"
fi
if ! backup_retain "$TIER_DIR" "$KEEP"; then
  echo "backup: retention step failed after verified backup; preserving the new backup" >&2
  exit 1
fi

echo "backup: completed $FINAL_DUMP"
