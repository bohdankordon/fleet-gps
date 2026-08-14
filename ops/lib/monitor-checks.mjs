// Host-level check evaluation for Stage 23. All I/O goes through an injected
// "runtime" so the exact same code is exercised in production and in unit
// tests with fixtures. Pure decision helpers are exported for direct testing.

import path from "node:path";
import {
  BACKUP_DUMP_NAME_RE,
  BACKUP_SHA_NAME_RE,
  CHECK_IDS,
  MONITOR_THRESHOLDS,
  SEVERITY,
  diskFreePercentFromStatfs,
  diskSeverityForFreePercent,
} from "./monitor-config.mjs";

const CONTAINER_SERVICES = Object.freeze([
  Object.freeze({ service: "caddy", checkId: CHECK_IDS.CONTAINER_CADDY }),
  Object.freeze({ service: "web", checkId: CHECK_IDS.CONTAINER_WEB }),
  Object.freeze({ service: "api", checkId: CHECK_IDS.CONTAINER_API }),
  Object.freeze({ service: "postgres", checkId: CHECK_IDS.CONTAINER_POSTGRES }),
]);

// A Docker container is healthy only while reported "running" and never
// "unhealthy". stopped/exited/restarting/dead/created/paused all fail.
export function evaluateContainerService(container) {
  if (!container) return SEVERITY.CRITICAL;
  if (container.state !== "running") return SEVERITY.CRITICAL;
  if (container.health === "unhealthy") return SEVERITY.CRITICAL;
  return SEVERITY.HEALTHY;
}

// Parse "docker compose ps --format json" (newline-delimited JSON objects)
// into service name -> { state, health }.
export function parseComposePsLines(output) {
  const map = new Map();
  if (typeof output !== "string") return map;
  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    let entry;
    try {
      entry = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (!entry || typeof entry !== "object" || typeof entry.Service !== "string") continue;
    map.set(entry.Service, {
      state: typeof entry.State === "string" ? entry.State : "",
      health: typeof entry.Health === "string" ? entry.Health : "",
    });
  }
  return map;
}

// Select the latest finalized managed daily backup pair. Only exact managed
// filenames that are regular, non-symlink files count; unrelated, malformed,
// lone, or symlink files are never accepted as candidates.
export function selectLatestDailyBackup(entries) {
  if (!Array.isArray(entries)) return null;
  const regular = new Map();
  for (const entry of entries) {
    if (!entry || typeof entry.name !== "string") continue;
    if (entry.isSymlink === true || entry.isFile !== true) continue;
    regular.set(entry.name, entry);
  }

  let latest = null;
  for (const [name] of regular) {
    if (!BACKUP_DUMP_NAME_RE.test(name)) continue;
    const shaName = name + ".sha256";
    if (!regular.has(shaName)) continue;
    if (!BACKUP_SHA_NAME_RE.test(shaName)) continue;
    if (latest === null || name > latest.dump) latest = { dump: name, sha: shaName };
  }
  return latest;
}

// Parse the zero-padded UTC timestamp embedded in a managed dump filename.
export function backupTimestampMs(name) {
  if (!BACKUP_DUMP_NAME_RE.test(name)) return null;
  const stamp = name.slice("taxi-gps-".length, -".dump".length);
  const year = Number(stamp.slice(0, 4));
  const month = Number(stamp.slice(5, 7));
  const day = Number(stamp.slice(8, 10));
  const hour = Number(stamp.slice(11, 13));
  const minute = Number(stamp.slice(13, 15));
  const second = Number(stamp.slice(15, 17));
  return Date.UTC(year, month - 1, day, hour, minute, second);
}

// Decide whether the latest backup pair must be re-verified. The cache is keyed
// by the exact pair identity (basename + size + mtime of both files); a changed
// identity always reverifies, and an unchanged identity reverifies periodically.
export function decideIntegrityVerification(latest, cache, now, revertifyIntervalMs = MONITOR_THRESHOLDS.integrityReverifyMs) {
  if (!latest) return { shouldVerify: false, reason: "none" };
  if (!cache) return { shouldVerify: true, reason: "new" };
  if (cache.dump.basename !== latest.dump.name || cache.sha.basename !== latest.sha.name) {
    return { shouldVerify: true, reason: "new" };
  }
  if (
    cache.dump.size !== latest.dump.size ||
    cache.dump.mtimeMs !== latest.dump.mtimeMs ||
    cache.sha.size !== latest.sha.size ||
    cache.sha.mtimeMs !== latest.sha.mtimeMs
  ) {
    return { shouldVerify: true, reason: "changed" };
  }
  if (now - cache.verifiedAt >= revertifyIntervalMs) {
    return { shouldVerify: true, reason: "periodic" };
  }
  return { shouldVerify: false, reason: "unchanged" };
}

function diskCheckResult(checkId, statfs, detailWhenUnavailable) {
  if (!statfs) return { checkId, status: SEVERITY.CRITICAL, detail: detailWhenUnavailable };
  const freePercent = diskFreePercentFromStatfs(statfs);
  if (freePercent === null) return { checkId, status: SEVERITY.CRITICAL, detail: detailWhenUnavailable };
  const status = diskSeverityForFreePercent(freePercent);
  return { checkId, status, detail: freePercent.toFixed(1) + "% free" };
}

function backupFreshnessResults({ missing, stale, invalid }) {
  return [
    { checkId: CHECK_IDS.BACKUP_MISSING, status: missing ? SEVERITY.CRITICAL : SEVERITY.HEALTHY, detail: missing ? "no finalized managed daily backup" : "daily backup present" },
    { checkId: CHECK_IDS.BACKUP_STALE, status: stale ? SEVERITY.CRITICAL : SEVERITY.HEALTHY, detail: stale ? "latest daily backup older than 30h" : "daily backup fresh" },
    { checkId: CHECK_IDS.BACKUP_INVALID, status: invalid ? SEVERITY.CRITICAL : SEVERITY.HEALTHY, detail: invalid ? "latest daily backup failed integrity verification" : "daily backup integrity verified" },
  ];
}

export function overallSeverity(results) {
  let worst = SEVERITY.HEALTHY;
  for (const result of results) {
    if (!result) continue;
    if (result.status === SEVERITY.CRITICAL) worst = SEVERITY.CRITICAL;
    else if (result.status === SEVERITY.WARNING && worst === SEVERITY.HEALTHY) worst = SEVERITY.WARNING;
  }
  return worst;
}

// Run every check through the injected runtime. Returns the check results and
// the integrity cache to persist (may be null to invalidate, or the previous
// cache when unchanged).
export async function runAllChecks({ runtime, config, now, integrityCache }) {
  const results = [];
  let cache = integrityCache;

  const engineOk = await runtime.dockerEngineOk();
  if (!engineOk) {
    results.push({ checkId: CHECK_IDS.DOCKER_ENGINE, status: SEVERITY.CRITICAL, detail: "Docker Engine unavailable" });
    // Do NOT manufacture four misleading container incidents when the engine is
    // down; a single stable DOCKER_ENGINE incident is the correct signal.
  } else {
    results.push({ checkId: CHECK_IDS.DOCKER_ENGINE, status: SEVERITY.HEALTHY, detail: "Docker Engine reachable" });

    const states = await runtime.composeServiceStates();
    for (const expected of CONTAINER_SERVICES) {
      const container = states ? states.get(expected.service) : null;
      const status = evaluateContainerService(container);
      results.push({
        checkId: expected.checkId,
        status,
        detail: status === SEVERITY.HEALTHY ? "running" : "not running healthily",
      });
    }

    const edge = await runtime.requestLocalHttps({ hostname: config.siteHostname, path: "/login" });
    results.push({
      checkId: CHECK_IDS.EDGE_HTTPS,
      status: edge.ok ? SEVERITY.HEALTHY : SEVERITY.CRITICAL,
      detail: edge.ok ? "HTTPS edge responding" : "HTTPS edge not responding",
    });

    const apiReady = await runtime.execApiReadiness();
    results.push({
      checkId: CHECK_IDS.API_READINESS,
      status: apiReady ? SEVERITY.HEALTHY : SEVERITY.CRITICAL,
      detail: apiReady ? "API readiness ok" : "API readiness failed",
    });

    const postgresReady = await runtime.execPostgresReadiness();
    results.push({
      checkId: CHECK_IDS.POSTGRES_READINESS,
      status: postgresReady ? SEVERITY.HEALTHY : SEVERITY.CRITICAL,
      detail: postgresReady ? "PostgreSQL ready" : "PostgreSQL not ready",
    });

    const postgresDataDir = await runtime.discoverPostgresDataDir();
    const postgresStatfs = postgresDataDir === null ? null : await runtime.statfs(postgresDataDir);
    // Once Docker is reachable, inability to discover or inspect the expected
    // PostgreSQL filesystem is itself a DB_DISK critical incident. Never omit
    // the check silently and never expose raw Docker output or host paths.
    results.push(diskCheckResult(CHECK_IDS.DB_DISK, postgresStatfs, "PostgreSQL data filesystem unavailable"));
  }

  // Backup filesystem and freshness are host-level and independent of Docker.
  const backupStatfs = await runtime.statfs(config.backupDir);
  results.push(diskCheckResult(CHECK_IDS.BACKUP_DISK, backupStatfs, "backup storage unavailable"));

  const dailyEntries = await runtime.listDirectory(path.join(config.backupDir, "daily"));
  const latestPair = selectLatestDailyBackup(dailyEntries ?? []);

  let missing = false;
  let stale = false;
  let invalid = false;

  if (latestPair === null) {
    missing = true;
  } else {
    const dumpPath = path.join(config.backupDir, "daily", latestPair.dump);
    const shaPath = path.join(config.backupDir, "daily", latestPair.sha);
    const dumpMeta = await runtime.statFile(dumpPath);
    const shaMeta = await runtime.statFile(shaPath);
    if (dumpMeta === null || shaMeta === null) {
      missing = true;
    } else {
      const age = now - backupTimestampMs(latestPair.dump);
      if (age > MONITOR_THRESHOLDS.backupFreshnessMs) {
        stale = true;
      } else {
        const latest = { dump: { name: latestPair.dump, ...dumpMeta }, sha: { name: latestPair.sha, ...shaMeta } };
        const decision = decideIntegrityVerification(latest, cache, now);
        if (decision.shouldVerify) {
          const verified = await runtime.verifyBackup(dumpPath);
          if (verified) {
            cache = Object.freeze({
              version: 1,
              dump: Object.freeze({ basename: latestPair.dump, size: dumpMeta.size, mtimeMs: dumpMeta.mtimeMs }),
              sha: Object.freeze({ basename: latestPair.sha, size: shaMeta.size, mtimeMs: shaMeta.mtimeMs }),
              verifiedAt: now,
            });
          } else {
            invalid = true;
            cache = null;
          }
        }
      }
    }
  }

  results.push(...backupFreshnessResults({ missing, stale, invalid }));
  return { results, cache };
}
