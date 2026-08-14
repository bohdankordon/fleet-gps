#!/bin/sh
set -eu

SCRIPT_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
REPOSITORY_ROOT="$(CDPATH= cd -- "$SCRIPT_ROOT/.." && pwd)"
TEST_ROOT="$(mktemp -d)"
trap 'rm -rf -- "$TEST_ROOT"' EXIT

printf 'synthetic fixture only\n' > "$TEST_ROOT/fixture.env"
cat > "$TEST_ROOT/fake-docker" <<'EOF'
#!/bin/sh
printf 'started\n' >> "$FIXTURE_STARTS_FILE"
if [ "${FIXTURE_HOLD_SECONDS:-0}" -gt 0 ]; then
  exec sleep "$FIXTURE_HOLD_SECONDS"
fi
exit 0
EOF
chmod +x "$TEST_ROOT/fake-docker"

cd "$REPOSITORY_ROOT"
BACKUP_LOCK_FILE="$TEST_ROOT/backup.lock" DOCKER_BIN="$TEST_ROOT/fake-docker" \
  FIXTURE_STARTS_FILE="$TEST_ROOT/starts" FIXTURE_HOLD_SECONDS=30 \
  sh "$SCRIPT_ROOT/backup-host.sh" daily "$TEST_ROOT/fixture.env" &
first_pid=$!

count=0
while [ ! -f "$TEST_ROOT/starts" ]; do
  count=$((count + 1))
  [ "$count" -lt 100 ] || { echo "backup lock test: first fixture did not start" >&2; exit 1; }
  sleep 0.05
done

if BACKUP_LOCK_FILE="$TEST_ROOT/backup.lock" DOCKER_BIN="$TEST_ROOT/fake-docker" \
  FIXTURE_STARTS_FILE="$TEST_ROOT/starts" \
  sh "$SCRIPT_ROOT/backup-host.sh" weekly "$TEST_ROOT/fixture.env" >"$TEST_ROOT/overlap.out" 2>&1; then
  echo "backup lock test: overlap unexpectedly passed" >&2
  exit 1
fi
grep -q 'another backup is already running' "$TEST_ROOT/overlap.out"

kill -9 "$first_pid"
wait "$first_pid" 2>/dev/null || true
BACKUP_LOCK_FILE="$TEST_ROOT/backup.lock" DOCKER_BIN="$TEST_ROOT/fake-docker" \
  FIXTURE_STARTS_FILE="$TEST_ROOT/starts" \
  sh "$SCRIPT_ROOT/backup-host.sh" daily "$TEST_ROOT/fixture.env"
BACKUP_LOCK_FILE="$TEST_ROOT/backup.lock" DOCKER_BIN="$TEST_ROOT/fake-docker" \
  FIXTURE_STARTS_FILE="$TEST_ROOT/starts" \
  sh "$SCRIPT_ROOT/backup-host.sh" weekly "$TEST_ROOT/fixture.env"

[ -f "$TEST_ROOT/backup.lock" ]
[ ! -d "$TEST_ROOT/backup.lock" ]
[ "$(wc -l < "$TEST_ROOT/starts" | tr -d ' ')" = "3" ]

grep -q 'ops/backup-host.sh daily .env.production' "$REPOSITORY_ROOT/docs/backup-restore.md"
grep -q 'ops/backup-host.sh daily .env.production' "$REPOSITORY_ROOT/ops/systemd/README.md"
grep -q 'ops/backup-host.sh daily .env.production' "$REPOSITORY_ROOT/ops/systemd/taxi-gps-backup-daily.service"
grep -q 'ops/backup-host.sh weekly .env.production' "$REPOSITORY_ROOT/ops/systemd/taxi-gps-backup-weekly.service"

echo "backup lock tests: passed"
