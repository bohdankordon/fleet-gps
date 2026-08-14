#!/bin/sh
set -eu

# Standalone checksum verification for a completed backup.
# Usage: backup-verify.sh <dump-file>

BACKUP_FILE="${1:-}"
: "${BACKUP_FILE:?usage: backup-verify.sh <dump-file>}"

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
. "$SCRIPT_DIR/lib/backup-common.sh"

if backup_verify "$BACKUP_FILE"; then
  echo "backup-verify: OK: $BACKUP_FILE"
else
  echo "backup-verify: FAILED: $BACKUP_FILE" >&2
  exit 1
fi
