#!/bin/sh
set -eu

SCRIPT_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
TEST_ROOT="$(mktemp -d)"
trap 'rm -rf -- "$TEST_ROOT"' EXIT

. "$SCRIPT_ROOT/lib/backup-common.sh"

write_sidecar() {
  dump="$1"
  name="$2"
  hash="$(sha256sum "$dump" | awk '{print $1}')"
  printf '%s  %s\n' "$hash" "$name" > "$dump.sha256"
}

assert_restore_stops_at_integrity() {
  dump="$1"
  marker="$TEST_ROOT/pg_restore-called"
  rm -f "$marker"
  if PATH="$TEST_ROOT/bin:$PATH" PGHOST=fixture PGUSER=fixture PGPASSWORD=fixture \
    "$SCRIPT_ROOT/restore.sh" --backup "$dump" --target-db fixture_target >/dev/null 2>&1; then
    echo "backup integrity test: invalid restore unexpectedly passed" >&2
    exit 1
  fi
  [ ! -e "$marker" ] || { echo "backup integrity test: pg_restore reached before integrity passed" >&2; exit 1; }
}

assert_invalid() {
  dump="$1"
  if backup_verify "$dump" >/dev/null 2>&1; then
    echo "backup integrity test: invalid fixture unexpectedly verified" >&2
    exit 1
  fi
  assert_restore_stops_at_integrity "$dump"
}

mkdir -p "$TEST_ROOT/bin"
cat > "$TEST_ROOT/bin/pg_restore" <<EOF
#!/bin/sh
touch "$TEST_ROOT/pg_restore-called"
exit 99
EOF
chmod +x "$TEST_ROOT/bin/pg_restore"

correct_dir="$TEST_ROOT/correct"
mkdir "$correct_dir"
correct="$correct_dir/taxi-gps-2026-08-14T010101Z.dump"
printf 'correct dump\n' > "$correct"
write_sidecar "$correct" "$(basename "$correct")"
backup_verify "$correct"

trailing_dir="$TEST_ROOT/trailing"
mkdir "$trailing_dir"
trailing="$trailing_dir/taxi-gps-2026-08-14T010111Z.dump"
printf 'trailing\n' > "$trailing"
write_sidecar "$trailing" "$(basename "$trailing")"
printf 'TRAILING-GARBAGE' >> "$trailing.sha256"
assert_invalid "$trailing"

blank_dir="$TEST_ROOT/blank"
mkdir "$blank_dir"
blank="$blank_dir/taxi-gps-2026-08-14T010112Z.dump"
printf 'blank second record\n' > "$blank"
write_sidecar "$blank" "$(basename "$blank")"
printf '\n' >> "$blank.sha256"
assert_invalid "$blank"

unterminated_dir="$TEST_ROOT/unterminated"
mkdir "$unterminated_dir"
unterminated="$unterminated_dir/taxi-gps-2026-08-14T010113Z.dump"
printf 'unterminated\n' > "$unterminated"
unterminated_hash="$(sha256sum "$unterminated" | awk '{print $1}')"
printf '%s  %s' "$unterminated_hash" "$(basename "$unterminated")" > "$unterminated.sha256"
assert_invalid "$unterminated"

corrupt_dir="$TEST_ROOT/corrupt"
mkdir "$corrupt_dir"
corrupt="$corrupt_dir/taxi-gps-2026-08-14T010102Z.dump"
printf 'before corruption\n' > "$corrupt"
write_sidecar "$corrupt" "$(basename "$corrupt")"
printf 'corruption\n' >> "$corrupt"
assert_invalid "$corrupt"

foreign_dir="$TEST_ROOT/foreign"
mkdir "$foreign_dir"
foreign="$foreign_dir/taxi-gps-2026-08-14T010103Z.dump"
other="$foreign_dir/taxi-gps-2026-08-14T010104Z.dump"
printf 'selected\n' > "$foreign"
printf 'other valid dump\n' > "$other"
write_sidecar "$foreign" "$(basename "$other")"
# Bind the sidecar hash to the foreign file too; legacy sha256sum -c behavior
# would have accepted this while the selected dump was never checked.
other_hash="$(sha256sum "$other" | awk '{print $1}')"
printf '%s  %s\n' "$other_hash" "$(basename "$other")" > "$foreign.sha256"
assert_invalid "$foreign"

traversal_dir="$TEST_ROOT/traversal"
mkdir "$traversal_dir"
traversal="$traversal_dir/taxi-gps-2026-08-14T010105Z.dump"
printf 'traversal\n' > "$traversal"
traversal_hash="$(sha256sum "$traversal" | awk '{print $1}')"
printf '%s  ../%s\n' "$traversal_hash" "$(basename "$traversal")" > "$traversal.sha256"
assert_invalid "$traversal"

absolute_dir="$TEST_ROOT/absolute"
mkdir "$absolute_dir"
absolute="$absolute_dir/taxi-gps-2026-08-14T010106Z.dump"
printf 'absolute\n' > "$absolute"
absolute_hash="$(sha256sum "$absolute" | awk '{print $1}')"
printf '%s  %s\n' "$absolute_hash" "$absolute" > "$absolute.sha256"
assert_invalid "$absolute"

multiple_dir="$TEST_ROOT/multiple"
mkdir "$multiple_dir"
multiple="$multiple_dir/taxi-gps-2026-08-14T010107Z.dump"
printf 'multiple\n' > "$multiple"
write_sidecar "$multiple" "$(basename "$multiple")"
cat "$multiple.sha256" >> "$multiple.sha256.tmp"
cat "$multiple.sha256" >> "$multiple.sha256.tmp"
mv "$multiple.sha256.tmp" "$multiple.sha256"
assert_invalid "$multiple"

malformed_dir="$TEST_ROOT/malformed"
mkdir "$malformed_dir"
malformed="$malformed_dir/taxi-gps-2026-08-14T010108Z.dump"
printf 'malformed\n' > "$malformed"
printf '%064d  %s\n' 0 "$(basename "$malformed")" | sed 's/^0/g/' > "$malformed.sha256"
assert_invalid "$malformed"

symlink_dump_dir="$TEST_ROOT/symlink-dump"
mkdir "$symlink_dump_dir"
real_dump="$symlink_dump_dir/real.dump"
symlink_dump="$symlink_dump_dir/taxi-gps-2026-08-14T010109Z.dump"
printf 'real\n' > "$real_dump"
ln -s "$real_dump" "$symlink_dump"
write_sidecar "$real_dump" "$(basename "$symlink_dump")"
mv "$real_dump.sha256" "$symlink_dump.sha256"
assert_invalid "$symlink_dump"

symlink_sha_dir="$TEST_ROOT/symlink-sha"
mkdir "$symlink_sha_dir"
symlink_sha_dump="$symlink_sha_dir/taxi-gps-2026-08-14T010110Z.dump"
printf 'real\n' > "$symlink_sha_dump"
write_sidecar "$symlink_sha_dump" "$(basename "$symlink_sha_dump")"
mv "$symlink_sha_dump.sha256" "$symlink_sha_dump.sha256.real"
ln -s "$symlink_sha_dump.sha256.real" "$symlink_sha_dump.sha256"
assert_invalid "$symlink_sha_dump"

echo "backup integrity tests: passed"
