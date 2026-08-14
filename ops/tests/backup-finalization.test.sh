#!/bin/sh
set -eu

SCRIPT_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
TEST_ROOT="$(mktemp -d)"
trap 'rm -rf -- "$TEST_ROOT"' EXIT
FAKE_BIN="$TEST_ROOT/bin"
mkdir -p "$FAKE_BIN"

cat > "$FAKE_BIN/date" <<'EOF'
#!/bin/sh
printf '%s\n' '2026-08-14T020304Z'
EOF
cat > "$FAKE_BIN/pg_dump" <<'EOF'
#!/bin/sh
for argument in "$@"; do
  case "$argument" in --file=*) output="${argument#--file=}" ;; esac
done
: "${output:?missing --file}"
printf 'synthetic pg_dump custom-format fixture\n' > "$output"
EOF
chmod +x "$FAKE_BIN/date" "$FAKE_BIN/pg_dump"

run_backup() {
  PATH="$FAKE_BIN:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
    PGHOST=fixture PGUSER=fixture PGPASSWORD=fixture PGDATABASE=fixture \
    BACKUP_DIR="$1" BACKUP_TIER=daily BACKUP_RETENTION_DAILY="${2:-14}" \
    "$SCRIPT_ROOT/backup.sh"
}

success_root="$TEST_ROOT/success"
run_backup "$success_root"
success_dump="$success_root/daily/taxi-gps-2026-08-14T020304Z.dump"
"$SCRIPT_ROOT/backup-verify.sh" "$success_dump" >/dev/null
[ ! -e "$success_root/.lock" ] || { echo "backup finalization test: stale directory lock exists" >&2; exit 1; }

collision_root="$TEST_ROOT/collision"
mkdir -p "$collision_root/daily"
collision_dump="$collision_root/daily/taxi-gps-2026-08-14T020304Z.dump"
collision_sha="$collision_dump.sha256"
printf 'pre-existing dump\n' > "$collision_dump"
printf 'pre-existing sidecar\n' > "$collision_sha"
before_dump="$(sha256sum "$collision_dump")"
before_sha="$(sha256sum "$collision_sha")"
if run_backup "$collision_root" >/dev/null 2>&1; then
  echo "backup finalization test: timestamp collision unexpectedly passed" >&2
  exit 1
fi
[ "$(sha256sum "$collision_dump")" = "$before_dump" ]
[ "$(sha256sum "$collision_sha")" = "$before_sha" ]

partial_root="$TEST_ROOT/partial"
mkdir -p "$partial_root/daily"
old_dump="$partial_root/daily/taxi-gps-2026-08-13T020304Z.dump"
printf 'older valid backup\n' > "$old_dump"
old_hash="$(sha256sum "$old_dump" | awk '{print $1}')"
printf '%s  %s\n' "$old_hash" "$(basename "$old_dump")" > "$old_dump.sha256"

cat > "$FAKE_BIN/ln" <<EOF
#!/bin/sh
state='$TEST_ROOT/ln-count'
count=0
[ ! -f \"\$state\" ] || count=\$(cat \"\$state\")
count=\$((count + 1))
printf '%s\n' \"\$count\" > \"\$state\"
if [ \"\$count\" -eq 2 ]; then exit 1; fi
exec /bin/ln \"\$@\"
EOF
chmod +x "$FAKE_BIN/ln"
if run_backup "$partial_root" 0 >/dev/null 2>&1; then
  echo "backup finalization test: injected partial finalization unexpectedly passed" >&2
  exit 1
fi
new_dump="$partial_root/daily/taxi-gps-2026-08-14T020304Z.dump"
[ ! -e "$new_dump" ] && [ ! -L "$new_dump" ]
[ ! -e "$new_dump.sha256" ] && [ ! -L "$new_dump.sha256" ]
[ -f "$old_dump" ] && [ -f "$old_dump.sha256" ] || {
  echo "backup finalization test: failed finalization pruned an older pair" >&2
  exit 1
}

echo "backup finalization tests: passed"
