import assert from "node:assert/strict";
import test from "node:test";
import { activeDurableRunResponseSchema, safeDurableRunSchema, type SafeDurableRun } from "./position-history-durable-run-contract";
import { readActiveDurableRun } from "./position-history-durable-run-browser";
import { createDurableRunReadRouteHandler } from "./position-history-durable-run-route-handler";
// import { fetchActiveDurableRun } from "./position-history-durable-run-client";
import { startDurableRunPolling } from "./position-history-durable-run-polling";

const exact = "2026-08-11T02:00:00.000Z";
const run = { id: "00000000-0000-4000-8000-000000000123", status: "RUNNING", initiatorType: "USER", to: exact, excludeProviderDisabled: true, windowBudget: 1000, committedWindows: 24, createdAt: exact, startedAt: exact, finishedAt: null, failureCategory: null } satisfies SafeDurableRun;

test("Phase0 active 15: no-active-run envelope is valid and parseable", () => {
  const parsed = activeDurableRunResponseSchema.safeParse({ active: null });
  assert.equal(parsed.success, true);
});
test("Phase0 active 16: Web maps envelope none to successful none", async () => {
  assert.equal(await readActiveDurableRun(async () => Response.json({ active: null })), null);
  // assert.equal(await fetchActiveDurableRun(async () => Response.json({ active: null })), null);
});
test("Phase0 active 17: actual failure remains failure", async () => {
  await assert.rejects(readActiveDurableRun(async () => Response.json({ active: null }, { status: 503 })), /active unavailable/);
  await assert.rejects(readActiveDurableRun(async () => { throw new Error("net"); }));
  assert.equal((await createDurableRunReadRouteHandler(async () => Response.json({ active: null }, { status: 500 }), "active")()).status, 503);
});
test("Phase0 active 18: active run remains parseable", async () => {
  assert.equal(safeDurableRunSchema.safeParse(run).success, true);
  assert.equal(activeDurableRunResponseSchema.safeParse({ active: run }).success, true);
  assert.deepEqual(await readActiveDurableRun(async () => Response.json({ active: run })), run);
});
test("Phase0 active 19 and history 27: polling does not turn failure into successful none", async () => {
  let callback!: () => void;
  let activeCalls = 0;
  const states: Array<SafeDurableRun | null> = [];
  let errors = 0;
  const stop = startDurableRunPolling({ anchor: exact, initialActive: run, loadActive: async () => { activeCalls += 1; throw new Error("poll fail"); }, loadRecent: async () => [], onActive: (v: SafeDurableRun | null) => states.push(v), onRecent: () => {}, refreshHorizon: () => {}, onActiveError: () => { errors += 1; }, schedule: (fn: () => void) => { callback = fn; return 1 as unknown as ReturnType<typeof setInterval>; }, cancel: () => {} });
  callback();
  await new Promise(setImmediate);
  stop();
  assert.equal(activeCalls, 1);
  assert.deepEqual(states, []);
  assert.equal(errors, 1);
});
test("Phase0 history 28: later successful poll recovers state", async () => {
  let callback!: () => void;
  let n = 0;
  const states: Array<SafeDurableRun | null> = [];
  let errors = 0;
  const stop = startDurableRunPolling({ anchor: exact, initialActive: run, loadActive: async () => { n += 1; if (n === 1) throw new Error("fail"); return null; }, loadRecent: async () => [], onActive: (v: SafeDurableRun | null) => states.push(v), onRecent: () => {}, refreshHorizon: () => {}, onActiveError: () => { errors += 1; }, schedule: (fn: () => void) => { callback = fn; return 1 as unknown as ReturnType<typeof setInterval>; }, cancel: () => {} });
  callback();
  await new Promise(setImmediate);
  callback();
  await new Promise(setImmediate);
  stop();
  assert.equal(errors, 1);
  assert.deepEqual(states, [null]);
});
