#!/bin/sh
set -eu

# Host entry point for the Stage 23 one-shot monitor. Holds a crash-released
# kernel flock for the duration of exactly one monitor run, then execs the Node
# monitor with the explicit production env file. The kernel releases the lock
# automatically on normal exit, signal termination, crash, or host restart.

ENV_FILE="${1:-.env.production}"
MONITOR_LOCK_FILE="${MONITOR_LOCK_FILE:-/run/lock/taxi-gps-monitor.lock}"
NODE_BIN="${NODE_BIN:-node}"
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

[ -f "$ENV_FILE" ] || { echo "monitor-host: env file is missing" >&2; exit 1; }
command -v flock >/dev/null 2>&1 || { echo "monitor-host: flock is required" >&2; exit 1; }

# shellcheck disable=SC3045 -- production host /bin/sh is required to support
# ordinary POSIX-style descriptor redirection used by util-linux flock.
exec 9>"$MONITOR_LOCK_FILE"
if ! flock -n 9; then
  echo "monitor-host: another monitor run is already in progress; skipping" >&2
  exit 0
fi

exec "$NODE_BIN" "$SCRIPT_DIR/monitor-host.mjs" --env-file "$ENV_FILE"
