#!/bin/sh
set -eu

# Compatibility entry point for an already-populated environment. The
# canonical deployment gate is `npm run production:check -- --env-file FILE`.
# Node's URL parser safely handles percent-encoded credentials without shell
# parsing or printing secret values.

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
exec node "$SCRIPT_DIR/validate-env.mjs"
