import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { shouldShowDurableCreateControls, startDurableRunPolling } from "./position-history-durable-run-polling";
import type { SafeDurableRun } from "./position-history-durable-run-contract";

const exact = "2026-08-11T02:00:00.000Z";
const run = { id: "00000000-0000-4000-8000-000000000123", status: "RUNNING", initiatorType: "USER", to: exact, excludeProviderDisabled: true, windowBudget: 1000, committedWindows: 24, createdAt: exact, startedAt: exact, finishedAt: null, failureCategory: null } satisfies SafeDurableRun;

test("Phase0 history 25: read failure visible as unavailable, not neutral none", () => {
  const page = readFileSync("src/app/admin/history/page.tsx", "utf8");
  assert.match(page, /initialDurableActiveUnavailable/);
  assert.match(page, /initialDurableRecentUnavailable/);
  const comp = readFileSync("src/components/position-history-durable-runs.tsx", "utf8");
  assert.match(comp, /history\.durable\.activeUnavailable/);
  assert.match(comp, /shouldShowDurableCreateControls/);
});
test("Phase0 history 26: successful none remains neutral none", () => {
  const comp = readFileSync("src/components/position-history-durable-runs.tsx", "utf8");
  assert.match(comp, /history\.durable\.none/);
});
test("Phase0 history 27: subsequent failure does not falsely erase truth", async () => {
  let callback!: () => void;
  const actives: Array<SafeDurableRun | null> = [];
  let activeErr = 0;
  const stop = startDurableRunPolling({ anchor: exact, initialActive: run, loadActive: async (): Promise<SafeDurableRun | null> => { throw new Error("fail"); }, loadRecent: async () => [], onActive: (v: SafeDurableRun | null) => actives.push(v), onRecent: () => {}, refreshHorizon: () => {}, onActiveError: () => { activeErr += 1; }, schedule: (fn: () => void) => { callback = fn; return 1 as unknown as ReturnType<typeof setInterval>; }, cancel: () => {} });
  callback();
  await new Promise(setImmediate);
  stop();
  assert.deepEqual(actives, []);
  assert.equal(activeErr, 1);
});
test("Phase0 history recent terminal refresh still works after active completes", async () => {
  let callback!: () => void;
  let recentCalls = 0;
  const stop = startDurableRunPolling({ anchor: exact, initialActive: run, loadActive: async (): Promise<SafeDurableRun | null> => null, loadRecent: async () => { recentCalls += 1; return []; }, onActive: () => {}, onRecent: () => {}, refreshHorizon: () => {}, schedule: (fn: () => void) => { callback = fn; return 1 as unknown as ReturnType<typeof setInterval>; }, cancel: () => {} });
  callback();
  await new Promise(setImmediate);
  stop();
  assert.equal(recentCalls, 1);
});
test("Repair recent A: initial null plus unavailable retries recent even when active stays null", async () => {
  let callback!: () => void;
  let recentCalls = 0;
  const stop = startDurableRunPolling({ anchor: exact, initialActive: null, loadActive: async (): Promise<SafeDurableRun | null> => null, loadRecent: async () => { recentCalls += 1; return []; }, onActive: () => {}, onRecent: () => {}, refreshHorizon: () => {}, onRecentError: () => {}, isRecentUnavailable: () => true, schedule: (fn: () => void) => { callback = fn; return 1 as unknown as ReturnType<typeof setInterval>; }, cancel: () => {} });
  callback();
  await new Promise(setImmediate);
  stop();
  assert.equal(recentCalls, 1);
});
test("Repair recent B-C-D: success clears, failure preserves, later success recovers", async () => {
  let callback!: () => void;
  let unavailable = true;
  const seen: Array<readonly SafeDurableRun[]> = [];
  let attempt = 0;
  const stale = [{ ...run, status: "SUCCEEDED", finishedAt: exact } as SafeDurableRun];
  const stop = startDurableRunPolling({ anchor: exact, initialActive: null, loadActive: async (): Promise<SafeDurableRun | null> => null, loadRecent: async () => { attempt += 1; if (attempt === 1) throw new Error("recent down"); return stale; }, onActive: () => {}, onRecent: (v: readonly SafeDurableRun[]) => { seen.push(v); unavailable = false; }, refreshHorizon: () => {}, onRecentError: () => { unavailable = true; }, isRecentUnavailable: () => unavailable, schedule: (fn: () => void) => { callback = fn; return 1 as unknown as ReturnType<typeof setInterval>; }, cancel: () => {} });
  callback();
  await new Promise(setImmediate);
  assert.equal(unavailable, true);
  assert.deepEqual(seen, []);
  callback();
  await new Promise(setImmediate);
  stop();
  assert.equal(unavailable, false);
  assert.equal(seen.length, 1);
});
test("Repair recent no-extra: null active without unavailable does not reload recent", async () => {
  let callback!: () => void;
  let recentCalls = 0;
  const stop = startDurableRunPolling({ anchor: exact, initialActive: null, loadActive: async (): Promise<SafeDurableRun | null> => null, loadRecent: async () => { recentCalls += 1; return []; }, onActive: () => {}, onRecent: () => {}, refreshHorizon: () => {}, isRecentUnavailable: () => false, schedule: (fn: () => void) => { callback = fn; return 1 as unknown as ReturnType<typeof setInterval>; }, cancel: () => {} });
  callback();
  await new Promise(setImmediate);
  stop();
  assert.equal(recentCalls, 0);
});
test("Repair create controls: suppressed while unavailable, restored after recovery", () => {
  assert.equal(shouldShowDurableCreateControls(null, false, true), true);
  assert.equal(shouldShowDurableCreateControls(null, true, true), false);
  assert.equal(shouldShowDurableCreateControls(run, false, true), false);
  assert.equal(shouldShowDurableCreateControls(null, false, false), false);
});
