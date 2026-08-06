import assert from "node:assert/strict";
import test from "node:test";
import { SyncSchedulerController } from "./sync-scheduler.controller";

function responseSpy() {
  let code = 0;
  let body: unknown;
  return { response: { status(value: number) { code = value; return this; }, json(value: unknown) { body = value; } }, result: () => ({ code, body }) };
}

const safeStatus = Object.freeze({ enabled: false, startedAt: null, fleetIntervalSeconds: 60, runsIntervalSeconds: 300, fleet: Object.freeze({ running: false, lastAttemptAt: null, lastSuccessAt: null, lastFailureAt: null, lastFailureCategory: null, consecutiveFailures: 0, successfulRuns: 0, failedRuns: 0, skippedOverlaps: 0 }), runs: Object.freeze({ running: false, lastAttemptAt: null, lastSuccessAt: null, lastFailureAt: null, lastFailureCategory: null, consecutiveFailures: 0, successfulRuns: 0, failedRuns: 0, skippedOverlaps: 0 }), generatedAt: "2026-08-06T10:00:00.000Z" });

test("status controller returns the complete safe disabled contract once", () => {
  let calls = 0;
  const controller = new SyncSchedulerController({ getStatus: () => { calls += 1; return safeStatus; } } as never);
  const spy = responseSpy();
  controller.getStatus(spy.response as never);
  const result = spy.result();
  assert.equal(calls, 1);
  assert.equal(result.code, 200);
  assert.deepEqual(result.body, safeStatus);
  assert.equal("shutdownTimeoutMs" in (result.body as object), false);
});

test("status controller hides internal failures", () => {
  const controller = new SyncSchedulerController({ getStatus: () => { throw new Error("https://private.example/?token=private"); } } as never);
  const spy = responseSpy();
  controller.getStatus(spy.response as never);
  assert.deepEqual(spy.result(), { code: 500, body: { statusCode: 500, error: "Internal Server Error" } });
});
