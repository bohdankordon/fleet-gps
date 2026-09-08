import assert from "node:assert/strict";
import test from "node:test";
import { shouldShowDurableCreateControls, startDurableRunPolling } from "./position-history-durable-run-polling";
import type { SafeDurableRun } from "./position-history-durable-run-contract";

const exact = "2026-08-11T02:00:00.000Z";
const run = { id: "00000000-0000-4000-8000-000000000123", status: "RUNNING", initiatorType: "USER", to: exact, excludeProviderDisabled: true, windowBudget: 1000, committedWindows: 24, createdAt: exact, startedAt: exact, finishedAt: null, failureCategory: null } satisfies SafeDurableRun;
function deferred<T>() { let resolve!: (v: T) => void; let reject!: (e: unknown) => void; const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; }); return { promise, resolve, reject }; }
async function flush(): Promise<void> { await new Promise(setImmediate); await new Promise(setImmediate); }

test("Race A: stale null poll after created run is ignored, controls stay suppressed", async () => {
  let callback!: () => void;
  let epoch = 0;
  let appliedActive: SafeDurableRun | null = null;
  let appliedUnavailable = false;
  const onActiveCalls: Array<SafeDurableRun | null> = [];
  const oldPoll = deferred<SafeDurableRun | null>();
  const stop = startDurableRunPolling({ anchor: exact, initialActive: null, loadActive: () => oldPoll.promise, loadRecent: async () => [], onActive: (v: SafeDurableRun | null) => { onActiveCalls.push(v); appliedActive = v; appliedUnavailable = false; }, onRecent: () => {}, refreshHorizon: () => {}, onActiveError: () => { appliedUnavailable = true; }, getActiveEpoch: () => epoch, schedule: (fn: () => void) => { callback = fn; return 1 as unknown as ReturnType<typeof setInterval>; }, cancel: () => {} });
  callback();
  await flush();
  epoch += 1;
  epoch += 1;
  appliedActive = run;
  appliedUnavailable = false;
  oldPoll.resolve(null);
  await flush();
  stop();
  assert.deepEqual(onActiveCalls, []);
  assert.equal(appliedActive?.id, run.id);
  assert.equal(appliedUnavailable, false);
  assert.equal(shouldShowDurableCreateControls(appliedActive, appliedUnavailable, true), false);
});

test("Race B: old healthy poll must not clear unavailable, new poll recovers", async () => {
  let callback!: () => void;
  let epoch = 0;
  let appliedUnavailable = false;
  const onActiveCalls: Array<SafeDurableRun | null> = [];
  const oldPoll = deferred<SafeDurableRun | null>();
  const stop = startDurableRunPolling({ anchor: exact, initialActive: null, loadActive: () => oldPoll.promise, loadRecent: async () => [], onActive: (v: SafeDurableRun | null) => { onActiveCalls.push(v); appliedUnavailable = false; }, onRecent: () => {}, refreshHorizon: () => {}, onActiveError: () => { appliedUnavailable = true; }, getActiveEpoch: () => epoch, schedule: (fn: () => void) => { callback = fn; return 1 as unknown as ReturnType<typeof setInterval>; }, cancel: () => {} });
  callback();
  await flush();
  epoch += 1;
  epoch += 1;
  appliedUnavailable = true;
  oldPoll.resolve(null);
  await flush();
  assert.deepEqual(onActiveCalls, []);
  assert.equal(appliedUnavailable, true);
  assert.equal(shouldShowDurableCreateControls(null, appliedUnavailable, true), false);
  stop();
  let callback2!: () => void;
  const stop2 = startDurableRunPolling({ anchor: exact, initialActive: null, loadActive: async (): Promise<SafeDurableRun | null> => null, loadRecent: async () => [], onActive: (v: SafeDurableRun | null) => { appliedUnavailable = false; }, onRecent: () => {}, refreshHorizon: () => {}, getActiveEpoch: () => epoch, schedule: (fn: () => void) => { callback2 = fn; return 1 as unknown as ReturnType<typeof setInterval>; }, cancel: () => {} });
  callback2();
  await flush();
  stop2();
  assert.equal(appliedUnavailable, false);
  assert.equal(shouldShowDurableCreateControls(null, appliedUnavailable, true), true);
});

test("Race confirmed-none: stale prior run ignored, confirmed none stays authoritative", async () => {
  let callback!: () => void;
  let epoch = 0;
  let appliedActive: SafeDurableRun | null = run;
  const onActiveCalls: Array<SafeDurableRun | null> = [];
  const oldPoll = deferred<SafeDurableRun | null>();
  const stop = startDurableRunPolling({ anchor: exact, initialActive: run, loadActive: () => oldPoll.promise, loadRecent: async () => [], onActive: (v: SafeDurableRun | null) => { onActiveCalls.push(v); appliedActive = v; }, onRecent: () => {}, refreshHorizon: () => {}, getActiveEpoch: () => epoch, schedule: (fn: () => void) => { callback = fn; return 1 as unknown as ReturnType<typeof setInterval>; }, cancel: () => {} });
  callback();
  await flush();
  epoch += 1;
  epoch += 1;
  appliedActive = null;
  oldPoll.resolve(run);
  await flush();
  stop();
  assert.deepEqual(onActiveCalls, []);
  assert.equal(appliedActive, null);
});

test("Race recent: stale active tick does not corrupt recent retry, new poll recovers", async () => {
  let callback!: () => void;
  let epoch = 0;
  let unavailable = true;
  let recentCalls = 0;
  const seen: Array<readonly SafeDurableRun[]> = [];
  const oldActive = deferred<SafeDurableRun | null>();
  const stop = startDurableRunPolling({ anchor: exact, initialActive: null, loadActive: () => oldActive.promise, loadRecent: async () => { recentCalls += 1; return []; }, onActive: () => {}, onRecent: (v: readonly SafeDurableRun[]) => { seen.push(v); unavailable = false; }, refreshHorizon: () => {}, onRecentError: () => { unavailable = true; }, isRecentUnavailable: () => unavailable, getActiveEpoch: () => epoch, schedule: (fn: () => void) => { callback = fn; return 1 as unknown as ReturnType<typeof setInterval>; }, cancel: () => {} });
  callback();
  await flush();
  epoch += 1;
  epoch += 1;
  oldActive.resolve(null);
  await flush();
  stop();
  assert.equal(recentCalls, 0);
  assert.equal(unavailable, true);
  assert.deepEqual(seen, []);
});
