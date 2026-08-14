// Shared constants and pure helpers for the Stage 23 host-level monitor.
// This module deliberately contains no I/O and no secrets so it can be unit
// tested deterministically.

export const CHECK_IDS = Object.freeze({
  DOCKER_ENGINE: "DOCKER_ENGINE",
  CONTAINER_CADDY: "CONTAINER_CADDY",
  CONTAINER_WEB: "CONTAINER_WEB",
  CONTAINER_API: "CONTAINER_API",
  CONTAINER_POSTGRES: "CONTAINER_POSTGRES",
  EDGE_HTTPS: "EDGE_HTTPS",
  API_READINESS: "API_READINESS",
  POSTGRES_READINESS: "POSTGRES_READINESS",
  DB_DISK: "DB_DISK",
  BACKUP_DISK: "BACKUP_DISK",
  BACKUP_MISSING: "BACKUP_MISSING",
  BACKUP_STALE: "BACKUP_STALE",
  BACKUP_INVALID: "BACKUP_INVALID",
});

export const SEVERITY = Object.freeze({
  HEALTHY: "healthy",
  WARNING: "warning",
  CRITICAL: "critical",
});

export const SEVERITY_ORDER = Object.freeze([SEVERITY.HEALTHY, SEVERITY.WARNING, SEVERITY.CRITICAL]);

// Safe, fixed operator-facing descriptions. These never contain dynamic
// command output, exception text, or credentials.
export const CHECK_DESCRIPTIONS = Object.freeze({
  [CHECK_IDS.DOCKER_ENGINE]: "Docker Engine is unavailable",
  [CHECK_IDS.CONTAINER_CADDY]: "Caddy container is not running healthily",
  [CHECK_IDS.CONTAINER_WEB]: "Web container is not running healthily",
  [CHECK_IDS.CONTAINER_API]: "API container is not running healthily",
  [CHECK_IDS.CONTAINER_POSTGRES]: "PostgreSQL container is not running healthily",
  [CHECK_IDS.EDGE_HTTPS]: "Public HTTPS edge is not serving correctly",
  [CHECK_IDS.API_READINESS]: "API readiness endpoint is not healthy",
  [CHECK_IDS.POSTGRES_READINESS]: "PostgreSQL is not ready",
  [CHECK_IDS.DB_DISK]: "PostgreSQL data filesystem is low on space",
  [CHECK_IDS.BACKUP_DISK]: "Backup filesystem is low on space",
  [CHECK_IDS.BACKUP_MISSING]: "No finalized managed daily backup exists",
  [CHECK_IDS.BACKUP_STALE]: "Latest finalized daily backup is stale",
  [CHECK_IDS.BACKUP_INVALID]: "Latest managed daily backup failed integrity verification",
});

export const MONITOR_THRESHOLDS = Object.freeze({
  diskWarningPercent: 15,
  diskCriticalPercent: 5,
  backupFreshnessMs: 30 * 60 * 60 * 1000,
  reminderIntervalMs: 6 * 60 * 60 * 1000,
  integrityReverifyMs: 6 * 60 * 60 * 1000,
});

// The public representative route for the local-edge HTTPS probe. Read-only,
// no session creation and no database mutation.
export const EDGE_PROBE_PATH = "/login";

// Managed daily backup filenames use a zero-padded UTC timestamp:
//   taxi-gps-YYYY-MM-DDTHHMMSSZ.dump
// and a matching .sha256 sidecar. Lexicographic ordering equals chronological
// ordering, which keeps candidate selection simple and deterministic.
export const BACKUP_DUMP_NAME_RE = /^taxi-gps-[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{6}Z\.dump$/;
export const BACKUP_SHA_NAME_RE = /^taxi-gps-[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{6}Z\.dump\.sha256$/;

export function isHealthySeverity(severity) {
  return severity === SEVERITY.HEALTHY;
}

export function isIncidentSeverity(severity) {
  return severity === SEVERITY.WARNING || severity === SEVERITY.CRITICAL;
}

// Incident identity derives from stable facts only: a stable check ID plus the
// current severity. Timestamps and variable error messages must never affect
// the fingerprint.
export function incidentFingerprint(checkId, severity) {
  return checkId + ":" + severity;
}

export function isValidCheckId(value) {
  return typeof value === "string" && Object.values(CHECK_IDS).includes(value);
}

export function isValidSeverity(value) {
  return typeof value === "string" && (value === SEVERITY.WARNING || value === SEVERITY.CRITICAL || value === SEVERITY.HEALTHY);
}

export function isValidFingerprint(value) {
  if (typeof value !== "string") return false;
  const separator = value.lastIndexOf(":");
  if (separator <= 0 || separator === value.length - 1) return false;
  const checkId = value.slice(0, separator);
  const severity = value.slice(separator + 1);
  return isValidCheckId(checkId) && isValidSeverity(severity) && severity !== SEVERITY.HEALTHY;
}

// Convert a list of check results into the sorted, deduplicated set of active
// incident fingerprints. Non-incident (healthy) results are ignored.
export function incidentFingerprints(checkResults) {
  const fingerprints = [];
  for (const result of checkResults) {
    if (!result || !isValidCheckId(result.checkId) || !isIncidentSeverity(result.status)) continue;
    fingerprints.push(incidentFingerprint(result.checkId, result.status));
  }
  return [...new Set(fingerprints)].sort();
}

// The free-space percentage interpretation is exact and monotonic:
//   free >= 15%                 -> healthy
//   5%  <= free < 15%           -> WARNING
//   free < 5%                   -> CRITICAL
export function diskSeverityForFreePercent(freePercent) {
  if (freePercent >= MONITOR_THRESHOLDS.diskWarningPercent) return SEVERITY.HEALTHY;
  if (freePercent < MONITOR_THRESHOLDS.diskCriticalPercent) return SEVERITY.CRITICAL;
  return SEVERITY.WARNING;
}

// Compute the free-space percentage from a POSIX statfs-shaped result. Blocks
// available to the unprivileged caller (bavail) is the conservative choice.
export function diskFreePercentFromStatfs(statfs) {
  if (!statfs || typeof statfs.blocks !== "number" || typeof statfs.bavail !== "number") return null;
  if (statfs.blocks <= 0) return null;
  return (statfs.bavail / statfs.blocks) * 100;
}

export function toUtcTimestamp(nowMs) {
  return new Date(nowMs).toISOString();
}
