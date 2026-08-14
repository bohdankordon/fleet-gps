# Shared helpers for the Stage 22 backup/restore tooling.
# POSIX sh, busybox-compatible (runs inside the postgres:17-alpine image).

backup_is_dump_name() {
  case "$1" in
    taxi-gps-[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9][0-9][0-9][0-9][0-9]Z.dump) return 0 ;;
    *) return 1 ;;
  esac
}

backup_is_sha_name() {
  case "$1" in
    taxi-gps-[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9][0-9][0-9][0-9][0-9]Z.dump.sha256) return 0 ;;
    *) return 1 ;;
  esac
}

backup_is_regular() {
  [ -f "$1" ] && [ ! -L "$1" ]
}

# Strict positive decimal integer: no empty value, zero, sign, whitespace,
# decimal point, shell syntax, or leading-zero coercion.
backup_is_positive_retention() {
  case "$1" in
    ''|0|0*|*[!0-9]*) return 1 ;;
    *) return 0 ;;
  esac
}

# Verify a completed backup against its sidecar .sha256 file. Returns nonzero on
# any mismatch so restore can refuse before pg_restore is ever invoked.
backup_verify() {
  _bv_dump="$1"
  backup_is_regular "$_bv_dump" || { echo "backup-verify: not a regular file: $_bv_dump" >&2; return 1; }
  _bv_base="$(basename -- "$_bv_dump")"
  backup_is_dump_name "$_bv_base" || { echo "backup-verify: invalid managed dump filename" >&2; return 1; }
  _bv_sha="$_bv_dump.sha256"
  backup_is_regular "$_bv_sha" || { echo "backup-verify: missing or invalid checksum file: $_bv_sha" >&2; return 1; }

  # Managed sidecars contain exactly one newline-terminated record and EOF:
  #   <64 hex characters><two spaces><exact selected dump basename>
  # Compare the entire file after parsing its one possible record. This rejects
  # unterminated trailing bytes, blank lines, comments, and extra records.
  _bv_record="$(sed -n '1p' "$_bv_sha")"
  _bv_expected="$(printf '%s' "$_bv_record" | cut -c1-64)"
  _bv_suffix="$(printf '%s' "$_bv_record" | cut -c65-)"
  [ "${#_bv_expected}" -eq 64 ] || { echo "backup-verify: malformed SHA-256" >&2; return 1; }
  case "$_bv_expected" in *[!0-9A-Fa-f]*) echo "backup-verify: malformed SHA-256" >&2; return 1 ;; esac
  [ "$_bv_suffix" = "  $_bv_base" ] || {
    echo "backup-verify: checksum sidecar is not bound to the selected dump" >&2
    return 1
  }
  if ! printf '%s  %s\n' "$_bv_expected" "$_bv_base" | cmp -s - "$_bv_sha"; then
    echo "backup-verify: checksum sidecar must contain exactly one exact managed record" >&2
    return 1
  fi

  _bv_actual="$(sha256sum "$_bv_dump" | awk '{print $1}')" || return 1
  _bv_expected_lower="$(printf '%s' "$_bv_expected" | tr 'A-F' 'a-f')"
  [ "$_bv_actual" = "$_bv_expected_lower" ] || {
    echo "backup-verify: checksum mismatch" >&2
    return 1
  }
}

# Prune strictly-managed backup pairs beyond the given retention count.
# Only .dump + .dump.sha256 pairs with exact managed filenames are candidates.
# Unrelated files, malformed names, symlinks, and lone files are never touched.
backup_retain() {
  _br_tier="$1"
  _br_keep="$2"
  backup_is_positive_retention "$_br_keep" || { echo "backup-common: invalid retention count" >&2; return 1; }

  _br_candidates="$(
    for f in "$_br_tier"/taxi-gps-*.dump; do
      [ -e "$f" ] || continue
      _br_name="${f##*/}"
      backup_is_dump_name "$_br_name" || continue
      backup_is_regular "$f" || continue
      _br_sha="$f.sha256"
      backup_is_regular "$_br_sha" || continue
      backup_is_sha_name "$_br_name.sha256" || continue
      backup_verify "$f" >/dev/null 2>&1 || continue
      printf '%s\n' "$_br_name"
    done | sort -r | tail -n "+$((_br_keep + 1))"
  )" || return 1

  [ -n "$_br_candidates" ] || return 0
  printf '%s\n' "$_br_candidates" | while IFS= read -r _br_name; do
    _br_dump="$_br_tier/$_br_name"
    _br_sha="$_br_dump.sha256"
    if backup_is_regular "$_br_dump" && backup_is_dump_name "$_br_name"; then
      rm -f "$_br_dump" || { echo "backup-common: failed to prune managed dump" >&2; exit 1; }
    fi
    if backup_is_regular "$_br_sha" && backup_is_sha_name "$_br_name.sha256"; then
      rm -f "$_br_sha" || { echo "backup-common: failed to prune managed checksum" >&2; exit 1; }
    fi
  done
}
