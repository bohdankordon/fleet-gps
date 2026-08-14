#!/bin/sh
set -eu

SCRIPT_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
TEST_ROOT="$(mktemp -d)"
trap 'rm -rf -- "$TEST_ROOT"' EXIT
FAKE_BIN="$TEST_ROOT/bin"
mkdir -p "$FAKE_BIN"
. "$SCRIPT_ROOT/lib/backup-common.sh"

cat > "$FAKE_BIN/date" <<'EOF'
#!/bin/sh
: "${DATE_STATE:?DATE_STATE is required}"
count=0
[ ! -f "$DATE_STATE" ] || count="$(cat "$DATE_STATE")"
count=$((count + 1))
printf '%s\n' "$count" > "$DATE_STATE"
printf '2026-08-14T%06dZ\n' "$count"
EOF
cat > "$FAKE_BIN/pg_dump" <<'EOF'
#!/bin/sh
: "${PG_DUMP_MARKER:?PG_DUMP_MARKER is required}"
for argument in "$@"; do
  case "$argument" in --file=*) output="${argument#--file=}" ;; esac
done
: "${output:?missing --file}"
printf 'called\n' >> "$PG_DUMP_MARKER"
printf 'synthetic pg_dump fixture\n' > "$output"
EOF
cat > "$FAKE_BIN/rm" <<'EOF'
#!/bin/sh
if [ -n "${RETENTION_FAIL_PATH:-}" ]; then
  for argument in "$@"; do
    [ "$argument" = "$RETENTION_FAIL_PATH" ] && exit 1
  done
fi
exec /bin/rm "$@"
EOF
chmod +x "$FAKE_BIN/date" "$FAKE_BIN/pg_dump" "$FAKE_BIN/rm"

run_backup() {
  root="$1"
  tier="$2"
  daily="$3"
  weekly="$4"
  failure_path="${5:-}"
  (
    unset BACKUP_RETENTION_DAILY BACKUP_RETENTION_WEEKLY
    [ "$daily" = "__unset" ] || BACKUP_RETENTION_DAILY="$daily"
    [ "$weekly" = "__unset" ] || BACKUP_RETENTION_WEEKLY="$weekly"
    export BACKUP_RETENTION_DAILY BACKUP_RETENTION_WEEKLY
    PATH="$FAKE_BIN:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
      DATE_STATE="$root/date-state" PG_DUMP_MARKER="$root/pg_dump-calls" RETENTION_FAIL_PATH="$failure_path" \
      PGHOST=fixture PGUSER=fixture PGPASSWORD=fixture PGDATABASE=fixture BACKUP_DIR="$root" \
      "$SCRIPT_ROOT/backup.sh" "$tier"
  )
}

pair_count() {
  count=0
  for file in "$1/$2"/taxi-gps-*.dump; do
    [ -f "$file" ] && [ ! -L "$file" ] || continue
    backup_is_dump_name "${file##*/}" || continue
    count=$((count + 1))
  done
  printf '%s\n' "$count"
}

daily_root="$TEST_ROOT/default-daily"
for _ in $(seq 1 15); do run_backup "$daily_root" daily __unset __unset >/dev/null; done
[ "$(pair_count "$daily_root" daily)" = "14" ] || { echo "retention test: default daily did not keep 14" >&2; exit 1; }

weekly_root="$TEST_ROOT/default-weekly"
for _ in $(seq 1 9); do run_backup "$weekly_root" weekly __unset __unset >/dev/null; done
[ "$(pair_count "$weekly_root" weekly)" = "8" ] || { echo "retention test: default weekly did not keep 8" >&2; exit 1; }

explicit_root="$TEST_ROOT/explicit-positive"
for _ in $(seq 1 4); do run_backup "$explicit_root" daily 3 8 >/dev/null; done
[ "$(pair_count "$explicit_root" daily)" = "3" ] || { echo "retention test: explicit positive value did not keep 3" >&2; exit 1; }

safe_root="$TEST_ROOT/unrelated-files"
run_backup "$safe_root" daily __unset __unset >/dev/null
printf 'unrelated\n' > "$safe_root/daily/notes.txt"
printf 'malformed\n' > "$safe_root/daily/taxi-gps-malformed.dump"
printf 'malformed\n' > "$safe_root/daily/taxi-gps-malformed.dump.sha256"
printf 'symlink target\n' > "$safe_root/target"
ln -s "$safe_root/target" "$safe_root/daily/taxi-gps-2026-08-14T235959Z.dump"
printf 'sidecar\n' > "$safe_root/daily/taxi-gps-2026-08-14T235959Z.dump.sha256"
for _ in $(seq 1 14); do run_backup "$safe_root" daily __unset __unset >/dev/null; done
[ "$(pair_count "$safe_root" daily)" = "14" ]
[ -f "$safe_root/daily/notes.txt" ]
[ -f "$safe_root/daily/taxi-gps-malformed.dump" ]
[ -L "$safe_root/daily/taxi-gps-2026-08-14T235959Z.dump" ]

invalid_root="$TEST_ROOT/invalid"
mkdir -p "$invalid_root/daily"
printf 'old pair\n' > "$invalid_root/daily/taxi-gps-2026-08-14T000001Z.dump"
old_hash="$(sha256sum "$invalid_root/daily/taxi-gps-2026-08-14T000001Z.dump" | awk '{print $1}')"
printf '%s  %s\n' "$old_hash" 'taxi-gps-2026-08-14T000001Z.dump' > "$invalid_root/daily/taxi-gps-2026-08-14T000001Z.dump.sha256"
for invalid in 0 garbage -1 ''; do
  rm -f "$invalid_root/pg_dump-calls"
  if run_backup "$invalid_root" daily "$invalid" 8 >/dev/null 2>&1; then
    echo "retention test: invalid retention unexpectedly passed" >&2
    exit 1
  fi
  [ ! -e "$invalid_root/pg_dump-calls" ] || { echo "retention test: invalid retention reached pg_dump" >&2; exit 1; }
  [ ! -e "$invalid_root/date-state" ] || { echo "retention test: invalid retention reached finalization setup" >&2; exit 1; }
  [ -f "$invalid_root/daily/taxi-gps-2026-08-14T000001Z.dump" ] || { echo "retention test: invalid retention pruned" >&2; exit 1; }
  rm -f "$invalid_root/pg_dump-calls" "$invalid_root/date-state"
  if run_backup "$invalid_root" daily 8 "$invalid" >/dev/null 2>&1; then
    echo "retention test: invalid weekly retention unexpectedly passed" >&2
    exit 1
  fi
  [ ! -e "$invalid_root/pg_dump-calls" ] || { echo "retention test: invalid weekly retention reached pg_dump" >&2; exit 1; }
  [ ! -e "$invalid_root/date-state" ] || { echo "retention test: invalid weekly retention reached finalization setup" >&2; exit 1; }
  [ -f "$invalid_root/daily/taxi-gps-2026-08-14T000001Z.dump" ] || { echo "retention test: invalid weekly retention pruned" >&2; exit 1; }
done

failure_root="$TEST_ROOT/prune-failure"
run_backup "$failure_root" daily 1 8 >/dev/null
old_failure_dump="$failure_root/daily/taxi-gps-2026-08-14T000001Z.dump"
new_failure_dump="$failure_root/daily/taxi-gps-2026-08-14T000002Z.dump"
if run_backup "$failure_root" daily 1 8 "$old_failure_dump" >"$failure_root/failure.out" 2>&1; then
  echo "retention test: pruning failure unexpectedly passed" >&2
  exit 1
fi
[ -f "$new_failure_dump" ] && [ -f "$new_failure_dump.sha256" ] || { echo "retention test: pruning failure removed new pair" >&2; exit 1; }
[ -f "$old_failure_dump" ] || { echo "retention test: injected prune failure did not preserve old pair" >&2; exit 1; }
grep -q 'retention step failed after verified backup' "$failure_root/failure.out"
if grep -q 'backup: completed' "$failure_root/failure.out"; then
  echo "retention test: pruning failure reported success" >&2
  exit 1
fi

echo "backup retention tests: passed"
