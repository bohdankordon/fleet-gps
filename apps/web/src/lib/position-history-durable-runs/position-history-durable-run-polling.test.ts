import assert from "node:assert/strict";
import test from "node:test";
import { DURABLE_RUN_UI_POLL_MS, startDurableRunPolling } from "./position-history-durable-run-polling";
import type { SafeDurableRun } from "./position-history-durable-run-contract";

const exact = "2026-08-11T02:00:00.000Z";
const active = { id: "00000000-0000-4000-8000-000000000123", status: "RUNNING", initiatorType: "USER", to: exact, excludeProviderDisabled: true, windowBudget: 1000, committedWindows: 24, createdAt: exact, startedAt: exact, finishedAt: null, failureCategory: null } satisfies SafeDurableRun;

test("polling uses a fake 5-second GET cycle, preserves anchor, refreshes terminal recent, and stops on close", async () => {
  let callback!: () => void; let cadence = 0; let cancelled = false; let activeReads = 0; let recentReads = 0; const anchors: string[] = []; const states: Array<SafeDurableRun | null> = [];
  const stop = startDurableRunPolling({ anchor: exact, initialActive: active, loadActive: async () => { activeReads += 1; return null; }, loadRecent: async () => { recentReads += 1; return [{ ...active, status: "SUCCEEDED", finishedAt: exact }]; }, onActive: (value) => states.push(value), onRecent: () => undefined, refreshHorizon: (anchor) => anchors.push(anchor), schedule: (fn, ms) => { callback = fn; cadence = ms; return 1 as unknown as ReturnType<typeof setInterval>; }, cancel: () => { cancelled = true; } });
  assert.equal(cadence, DURABLE_RUN_UI_POLL_MS); callback(); await new Promise(setImmediate);
  assert.equal(activeReads, 1); assert.equal(recentReads, 1); assert.deepEqual(states, [null]); assert.deepEqual(anchors, [exact]); stop(); assert.equal(cancelled, true);
});

test("temporary read failure preserves known progress and causes no mutation", async () => {
  let callback!: () => void; let updates = 0; let recent = 0; let refreshes = 0;
  const stop = startDurableRunPolling({ anchor: exact, initialActive: active, loadActive: async () => { throw new Error("temporary"); }, loadRecent: async () => { recent += 1; return []; }, onActive: () => { updates += 1; }, onRecent: () => undefined, refreshHorizon: () => { refreshes += 1; }, schedule: (fn) => { callback = fn; return 1 as unknown as ReturnType<typeof setInterval>; }, cancel: () => undefined });
  callback(); await new Promise(setImmediate); stop(); assert.equal(updates, 0); assert.equal(recent, 0); assert.equal(refreshes, 0);
});

