import assert from "node:assert/strict";
import test from "node:test";
import { SyncSchedulerStatusService } from "./sync-scheduler-status.service";
import { SyncSchedulerStateError } from "./sync-scheduler.types";

const config = Object.freeze({ enabled: true, fleetIntervalSeconds: 60, runsIntervalSeconds: 300 });
const at = (value: string): Date => new Date(value);

test("status service returns an initial immutable snapshot without scheduler internals", () => {
  const service = new SyncSchedulerStatusService();
  const snapshot = service.snapshot(config, at("2026-08-06T10:00:00.000Z"));

  assert.deepEqual(snapshot, {
    enabled: true,
    startedAt: null,
    fleetIntervalSeconds: 60,
    runsIntervalSeconds: 300,
    fleet: {
      running: false,
      lastAttemptAt: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastFailureCategory: null,
      consecutiveFailures: 0,
      successfulRuns: 0,
      failedRuns: 0,
      skippedOverlaps: 0,
    },
    runs: {
      running: false,
      lastAttemptAt: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastFailureCategory: null,
      consecutiveFailures: 0,
      successfulRuns: 0,
      failedRuns: 0,
      skippedOverlaps: 0,
    },
    generatedAt: "2026-08-06T10:00:00.000Z",
  });
  assert.equal("shutdownTimeoutMs" in snapshot, false);
  assert.equal("exception" in snapshot.fleet, false);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.fleet), true);
  assert.equal(Object.isFrozen(snapshot.runs), true);
});

test("scheduler start keeps the first timestamp without changing job state", () => {
  const service = new SyncSchedulerStatusService();
  service.markSchedulerStarted(at("2026-08-06T10:00:00.000Z"));
  service.markSchedulerStarted(at("2026-08-06T11:00:00.000Z"));
  const snapshot = service.snapshot(config, at("2026-08-06T12:00:00.000Z"));

  assert.equal(snapshot.startedAt, "2026-08-06T10:00:00.000Z");
  assert.equal(snapshot.fleet.successfulRuns, 0);
  assert.equal(snapshot.runs.failedRuns, 0);
});

test("fleet and runs starts are independent", () => {
  const service = new SyncSchedulerStatusService();

  assert.equal(service.tryStart("fleet", at("2026-08-06T10:00:00.000Z")), true);
  assert.equal(service.tryStart("runs", at("2026-08-06T10:01:00.000Z")), true);

  const snapshot = service.snapshot(config, at("2026-08-06T10:02:00.000Z"));
  assert.equal(snapshot.fleet.running, true);
  assert.equal(snapshot.fleet.lastAttemptAt, "2026-08-06T10:00:00.000Z");
  assert.equal(snapshot.runs.running, true);
  assert.equal(snapshot.runs.lastAttemptAt, "2026-08-06T10:01:00.000Z");
});

test("overlapping starts increment only skipped overlaps", () => {
  const service = new SyncSchedulerStatusService();
  service.tryStart("fleet", at("2026-08-06T10:00:00.000Z"));
  assert.equal(service.tryStart("fleet", at("2026-08-06T10:01:00.000Z")), false);

  const fleet = service.snapshot(config, at("2026-08-06T10:02:00.000Z")).fleet;
  assert.equal(fleet.skippedOverlaps, 1);
  assert.equal(fleet.lastAttemptAt, "2026-08-06T10:00:00.000Z");
  assert.equal(fleet.failedRuns, 0);
  assert.equal(fleet.consecutiveFailures, 0);
  assert.equal(fleet.lastSuccessAt, null);
  assert.equal(fleet.lastFailureAt, null);
});

test("success completes a job and preserves historical failure metadata", () => {
  const service = new SyncSchedulerStatusService();
  service.tryStart("fleet", at("2026-08-06T10:00:00.000Z"));
  service.markFailure("fleet", at("2026-08-06T10:01:00.000Z"), "equgps");
  service.tryStart("fleet", at("2026-08-06T10:02:00.000Z"));
  service.markSuccess("fleet", at("2026-08-06T10:03:00.000Z"));

  const fleet = service.snapshot(config, at("2026-08-06T10:04:00.000Z")).fleet;
  assert.equal(fleet.running, false);
  assert.equal(fleet.successfulRuns, 1);
  assert.equal(fleet.consecutiveFailures, 0);
  assert.equal(fleet.lastSuccessAt, "2026-08-06T10:03:00.000Z");
  assert.equal(fleet.lastFailureAt, "2026-08-06T10:01:00.000Z");
  assert.equal(fleet.lastFailureCategory, "equgps");
});

test("failures accumulate independently and success resets only consecutive failures", () => {
  const service = new SyncSchedulerStatusService();
  service.markFailure("fleet", at("2026-08-06T10:00:00.000Z"), "database");
  service.markFailure("fleet", at("2026-08-06T10:01:00.000Z"), "configuration");
  service.markFailure("runs", at("2026-08-06T10:02:00.000Z"), "unknown");

  let snapshot = service.snapshot(config, at("2026-08-06T10:03:00.000Z"));
  assert.equal(snapshot.fleet.running, false);
  assert.equal(snapshot.fleet.failedRuns, 2);
  assert.equal(snapshot.fleet.consecutiveFailures, 2);
  assert.equal(snapshot.fleet.lastFailureCategory, "configuration");
  assert.equal(snapshot.runs.failedRuns, 1);
  assert.equal(snapshot.runs.consecutiveFailures, 1);

  service.markSuccess("fleet", at("2026-08-06T10:04:00.000Z"));
  snapshot = service.snapshot(config, at("2026-08-06T10:05:00.000Z"));
  assert.equal(snapshot.fleet.failedRuns, 2);
  assert.equal(snapshot.fleet.successfulRuns, 1);
  assert.equal(snapshot.fleet.consecutiveFailures, 0);
  assert.equal(snapshot.fleet.lastFailureCategory, "configuration");
  assert.equal(snapshot.runs.consecutiveFailures, 1);
});

test("shutdown reset clears only running flags", () => {
  const service = new SyncSchedulerStatusService();
  service.tryStart("fleet", at("2026-08-06T10:00:00.000Z"));
  service.tryStart("runs", at("2026-08-06T10:01:00.000Z"));
  service.markFailure("fleet", at("2026-08-06T10:02:00.000Z"), "database");
  service.tryStart("fleet", at("2026-08-06T10:03:00.000Z"));
  service.resetRunningAfterShutdown();
  service.resetRunningAfterShutdown();

  const snapshot = service.snapshot(config, at("2026-08-06T10:04:00.000Z"));
  assert.equal(snapshot.fleet.running, false);
  assert.equal(snapshot.runs.running, false);
  assert.equal(snapshot.fleet.failedRuns, 1);
  assert.equal(snapshot.fleet.lastFailureCategory, "database");
  assert.equal(snapshot.runs.lastAttemptAt, "2026-08-06T10:01:00.000Z");
});

test("snapshots are isolated deep copies", () => {
  const service = new SyncSchedulerStatusService();
  const first = service.snapshot(config, at("2026-08-06T10:00:00.000Z"));
  const second = service.snapshot(config, at("2026-08-06T10:01:00.000Z"));

  assert.notEqual(first, second);
  assert.notEqual(first.fleet, second.fleet);
  assert.throws(() => { (first.fleet as { running: boolean }).running = true; }, TypeError);
  assert.equal(service.snapshot(config, at("2026-08-06T10:02:00.000Z")).fleet.running, false);
});

test("invalid dates throw only the safe scheduler state error", () => {
  const service = new SyncSchedulerStatusService();
  const invalid = new Date("not-a-date");

  assert.throws(() => service.markSchedulerStarted(invalid), (error: unknown) => {
    assert.ok(error instanceof SyncSchedulerStateError);
    assert.equal(error.message, "Invalid sync scheduler state.");
    assert.equal(JSON.stringify(error).includes("not-a-date"), false);
    return true;
  });
});
