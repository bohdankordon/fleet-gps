#!/bin/sh
set -eu

# Canonical host entry point for every production backup. The kernel releases
# this flock automatically on normal exit, signal termination, process crash,
# or host restart; the lock file itself may persist harmlessly.

BACKUP_TIER="${1:-daily}"
ENV_FILE="${2:-.env.production}"
BACKUP_LOCK_FILE="${BACKUP_LOCK_FILE:-/run/lock/taxi-gps-backup.lock}"
DOCKER_BIN="${DOCKER_BIN:-docker}"

case "$BACKUP_TIER" in
  daily|weekly) ;;
  *) echo "backup-host: invalid tier (expected daily or weekly)" >&2; exit 1 ;;
esac

[ -f "$ENV_FILE" ] || { echo "backup-host: env file is missing" >&2; exit 1; }
command -v flock >/dev/null 2>&1 || { echo "backup-host: flock is required" >&2; exit 1; }

# shellcheck disable=SC3045 -- production host /bin/sh is required to support
# ordinary POSIX-style descriptor redirection used by util-linux flock.
exec 9>"$BACKUP_LOCK_FILE"
if ! flock -n 9; then
  echo "backup-host: another backup is already running" >&2
  exit 1
fi

exec "$DOCKER_BIN" compose -f compose.production.yaml --env-file "$ENV_FILE" \
  --profile backup run --rm -T -e "BACKUP_TIER=$BACKUP_TIER" backup
