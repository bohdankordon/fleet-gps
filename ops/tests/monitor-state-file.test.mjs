import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { CHECK_IDS, SEVERITY, incidentFingerprint } from "../lib/monitor-config.mjs";
import { MonitorStateError, emptyState, normalizeState } from "../lib/monitor-state.mjs";
import {
  deserializeState,
  ensureStateDirectory,
  readIntegrityCache,
  readStateFile,
  serializeState,
  writeIntegrityCacheAtomic,
  writeStateFileAtomic,
} from "../lib/monitor-state-file.mjs";

const WEB = incidentFingerprint(CHECK_IDS.CONTAINER_WEB, SEVERITY.CRITICAL);

function tempDir() {
  return mkdtempSync(path.join(os.tmpdir(), "taxi-gps-monitor-state-"));
}

test("state serialization round-trips and contains only the allowed schema keys", () => {
  const state = normalizeState({ version: 1, open: [WEB], notifiedAt: 1_800_000_000_000, notifiedSet: [WEB] });
  const text = serializeState(state);
  const parsed = JSON.parse(text);
  assert.deepEqual(Object.keys(parsed).sort(), ["notifiedAt", "notifiedSet", "open", "version"]);
  assert.equal(parsed.notifiedAt, "2027-01-15T08:00:00.000Z");
  assert.deepEqual(deserializeState(text), state);
});

test("writeStateFileAtomic writes 0600 files and readStateFile round-trips", () => {
  const dir = tempDir();
  try {
    ensureStateDirectory(dir);
    const file = path.join(dir, "incident-state.json");
    writeStateFileAtomic(file, normalizeState({ version: 1, open: [WEB], notifiedAt: 1_800_000_000_000, notifiedSet: [WEB] }));
    assert.deepEqual(readStateFile(file).open, [WEB]);
    assert.deepEqual(readdirSync(dir), ["incident-state.json"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("readStateFile returns empty state when the file is absent", () => {
  const dir = tempDir();
  try {
    ensureStateDirectory(dir);
    assert.deepEqual(readStateFile(path.join(dir, "incident-state.json")), emptyState());
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("readStateFile fails safely on corrupt state instead of silently discarding", () => {
  const dir = tempDir();
  try {
    ensureStateDirectory(dir);
    const file = path.join(dir, "incident-state.json");
    writeFileSync(file, "{not-json", "utf8");
    assert.throws(() => readStateFile(file), MonitorStateError);
    writeFileSync(file, JSON.stringify({ version: 999, open: [], notifiedAt: null, notifiedSet: null }), "utf8");
    assert.throws(() => readStateFile(file), MonitorStateError);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("readStateFile refuses a symlinked state file", (t) => {
  const dir = tempDir();
  try {
    ensureStateDirectory(dir);
    const target = path.join(dir, "real.json");
    const link = path.join(dir, "incident-state.json");
    writeFileSync(target, JSON.stringify({ version: 1, open: [], notifiedAt: null, notifiedSet: null }), "utf8");
    try {
      symlinkSync(target, link);
    } catch {
      t.skip("symlinks are not supported on this platform");
      return;
    }
    assert.throws(() => readStateFile(link), MonitorStateError);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("integrity cache round-trips and corrupt cache safely returns null", () => {
  const dir = tempDir();
  try {
    ensureStateDirectory(dir);
    const file = path.join(dir, "integrity-cache.json");
    const cache = Object.freeze({
      version: 1,
      dump: Object.freeze({ basename: "taxi-gps-2026-08-14T010101Z.dump", size: 1234, mtimeMs: 1_800_000_000_000 }),
      sha: Object.freeze({ basename: "taxi-gps-2026-08-14T010101Z.dump.sha256", size: 80, mtimeMs: 1_800_000_000_000 }),
      verifiedAt: 1_800_000_000_000,
    });
    writeIntegrityCacheAtomic(file, cache);
    assert.deepEqual(readIntegrityCache(file), cache);

    writeFileSync(file, "{corrupt", "utf8");
    assert.equal(readIntegrityCache(file), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
