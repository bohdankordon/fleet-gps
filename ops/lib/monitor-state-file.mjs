// Atomic, permission-safe persistence for the monitor incident state and the
// backup-integrity cache. Files are written 0600 inside a 0700 directory via
// temp + fsync + rename, and reads never follow symlinks.

import { closeSync, chmodSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeSync } from "node:fs";
import path from "node:path";
import { STATE_VERSION, MonitorStateError, emptyState, normalizeState } from "./monitor-state.mjs";

export const INTEGRITY_CACHE_VERSION = 1;

export function ensureStateDirectory(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = lstatSync(directory);
  if (stat.isSymbolicLink()) throw new MonitorStateError("monitor state directory must not be a symlink");
  if (!stat.isDirectory()) throw new MonitorStateError("monitor state path is not a directory");
  chmodSync(directory, 0o700);
  return directory;
}

function writeFileAtomicSync(file, content, mode) {
  const temp = file + ".tmp." + process.pid + "." + Math.random().toString(36).slice(2);
  const fd = openSync(temp, "wx", mode);
  try {
    writeSync(fd, content);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  try {
    renameSync(temp, file);
  } catch (error) {
    try {
      unlinkSync(temp);
    } catch {
      // best-effort temp cleanup
    }
    throw error;
  }
}

function assertRegularNonSymlink(file) {
  const stat = lstatSync(file);
  if (stat.isSymbolicLink()) throw new MonitorStateError("monitor state file must not be a symlink");
  if (!stat.isFile()) throw new MonitorStateError("monitor state path is not a regular file");
}

export function serializeState(state) {
  const normalized = normalizeState(state);
  return JSON.stringify({
    version: STATE_VERSION,
    open: normalized.open,
    notifiedAt: normalized.notifiedAt === null ? null : new Date(normalized.notifiedAt).toISOString(),
    notifiedSet: normalized.notifiedSet,
  });
}

export function deserializeState(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new MonitorStateError();
  }
  if (typeof raw !== "object" || raw === null || raw.version !== STATE_VERSION) throw new MonitorStateError();

  let notifiedAt = null;
  if (raw.notifiedAt !== null && raw.notifiedAt !== undefined) {
    if (typeof raw.notifiedAt !== "string") throw new MonitorStateError();
    const parsed = Date.parse(raw.notifiedAt);
    if (Number.isNaN(parsed)) throw new MonitorStateError();
    notifiedAt = parsed;
  }

  return normalizeState({ version: raw.version, open: raw.open, notifiedAt, notifiedSet: raw.notifiedSet });
}

export function readStateFile(file) {
  if (!existsSync(file)) return emptyState();
  assertRegularNonSymlink(file);
  return deserializeState(readFileSync(file, "utf8"));
}

export function writeStateFileAtomic(file, state) {
  writeFileAtomicSync(file, serializeState(state), 0o600);
}

// The integrity cache records the verified identity (basename + size + mtime)
// of the latest daily backup pair. Corruption is NOT a monitor failure: the
// safe recovery is to re-verify (more I/O, never less detection).
export function readIntegrityCache(file) {
  if (!existsSync(file)) return null;
  assertRegularNonSymlink(file);
  let raw;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
  if (
    typeof raw !== "object" ||
    raw === null ||
    raw.version !== INTEGRITY_CACHE_VERSION ||
    typeof raw.dump !== "object" ||
    raw.dump === null ||
    typeof raw.dump.basename !== "string" ||
    typeof raw.dump.size !== "number" ||
    typeof raw.dump.mtimeMs !== "number" ||
    typeof raw.sha !== "object" ||
    raw.sha === null ||
    typeof raw.sha.basename !== "string" ||
    typeof raw.sha.size !== "number" ||
    typeof raw.sha.mtimeMs !== "number" ||
    typeof raw.verifiedAt !== "number"
  ) {
    return null;
  }
  return Object.freeze({
    version: INTEGRITY_CACHE_VERSION,
    dump: Object.freeze({ basename: raw.dump.basename, size: raw.dump.size, mtimeMs: raw.dump.mtimeMs }),
    sha: Object.freeze({ basename: raw.sha.basename, size: raw.sha.size, mtimeMs: raw.sha.mtimeMs }),
    verifiedAt: raw.verifiedAt,
  });
}

export function writeIntegrityCacheAtomic(file, cache) {
  writeFileAtomicSync(
    file,
    JSON.stringify({
      version: INTEGRITY_CACHE_VERSION,
      dump: cache.dump,
      sha: cache.sha,
      verifiedAt: cache.verifiedAt,
    }),
    0o600,
  );
}

export function integrityCachePath(stateDir) {
  return path.join(stateDir, "integrity-cache.json");
}

export function incidentStatePath(stateDir) {
  return path.join(stateDir, "incident-state.json");
}
