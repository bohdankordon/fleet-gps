#!/bin/sh
set -eu

# Thin host entry point for systemd OnFailure operational notifications and the
# manual TEST procedure. Passes the kind and explicit env file to the Node
# notifier; the bot token is read only from that env file, never from argv.

KIND="${1:-monitor}"
ENV_FILE="${2:-.env.production}"
NODE_BIN="${NODE_BIN:-node}"
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

[ -f "$ENV_FILE" ] || { echo "notify-host: env file is missing" >&2; exit 1; }

exec "$NODE_BIN" "$SCRIPT_DIR/notify-host.mjs" --env-file "$ENV_FILE" --kind "$KIND"
