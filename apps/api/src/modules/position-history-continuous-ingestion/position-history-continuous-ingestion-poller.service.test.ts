import assert from "node:assert/strict";
import test from "node:test";
import type { ApiConfig } from "../../config/api-config";
import { POSITION_HISTORY_CONTINUOUS_POLL_INTERVAL_MS } from "./position-history-continuous-ingestion.constants";
import { POSITION_HISTORY_CONTINUOUS_POLL_TIMER, POSITION_HISTORY_CONTINUOUS_STARTUP_TIMER, PositionHistoryContinuousIngestionPollerService } from "./position-history-continuous-ingestion-poller.service";
import { PositionHistoryContinuousIngestionStatusService } from "./position-history-continuous-ingestion-status.service";
import { PositionHistoryIngestionTelemetryService } from "../position-history-horizon-execution/position-history-ingestion-telemetry.service";
import type { PositionHistoryContinuousCycleResult, PositionHistoryContinuousTimer } from "./position-history-continuous-ingestion.types";
import type { PositionHistoryWorkloadCoordinatorService } from "./position-history-workload-coordinator.service";

const empty: PositionHistoryContinuousCycleResult = { vehicles: 0, requests: 0, providerRows: 0, inserted: 0, duplicates: 0, invalid: 0, retries: 0, rateLimitResponses: 0, cursorAdvancements: 0, recentTailCompleted: 0, backlogCompleted: 0, providerBlocked: 0, failedWork: 0, lockUnavailable: 0 };

function harness(enabled: boolean, processCycle: () => Promise<PositionHistoryContinuousCycleResult>) {
  const timeouts = new Map<string, () => void>();
  const intervals = new Map<string, () => void>();
  const timer: PositionHistoryContinuousTimer = {
    addTimeout: (name, callback, milliseconds) => { assert.equal(milliseconds, 0); timeouts.set(name, callback); },
    addInterval: (name, callback, milliseconds) => { assert.equal(milliseconds, POSITION_HISTORY_CONTINUOUS_POLL_INTERVAL_MS); intervals.set(name, callback); },
    deleteTimeout: (name) => { timeouts.delete(name); },
    deleteInterval: (name) => { intervals.delete(name); },
  };
  const status = new PositionHistoryContinuousIngestionStatusService();
  const telemetry = new PositionHistoryIngestionTelemetryService({ now: () => new Date("2026-09-14T12:00:00Z") });
  const poller = new PositionHistoryContinuousIngestionPollerService({ positionHistoryContinuousIngestion: { enabled } } as ApiConfig, { processCycle } as PositionHistoryWorkloadCoordinatorService, status, timer, telemetry);
  return { poller, timeouts, intervals, status, telemetry };
}

test("disabled flag schedules no startup or interval work and makes zero worker calls", async () => {
  let calls = 0; const item = harness(false, async () => { calls += 1; return empty; });
  item.poller.onApplicationBootstrap();
  assert.equal(item.timeouts.size, 0); assert.equal(item.intervals.size, 0); assert.equal(calls, 0);
  assert.equal(item.poller.getStatus().enabled, false);
});
test("enabled bootstrap schedules immediate asynchronous catch-up without awaiting it", async () => {
  let calls = 0; const item = harness(true, async () => { calls += 1; return empty; });
  const returned = item.poller.onApplicationBootstrap();
  assert.equal(returned, undefined);
  assert.ok(item.timeouts.has(POSITION_HISTORY_CONTINUOUS_STARTUP_TIMER));
  assert.ok(item.intervals.has(POSITION_HISTORY_CONTINUOUS_POLL_TIMER));
  assert.equal(calls, 0);
  item.timeouts.get(POSITION_HISTORY_CONTINUOUS_STARTUP_TIMER)!();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);
});

test("one process never overlaps cycles", async () => {
  let calls = 0; let finish!: () => void;
  const gate = new Promise<void>((resolve) => { finish = resolve; });
  const item = harness(true, async () => { calls += 1; await gate; return empty; });
  item.poller.onApplicationBootstrap();
  item.timeouts.get(POSITION_HISTORY_CONTINUOUS_STARTUP_TIMER)!();
  item.intervals.get(POSITION_HISTORY_CONTINUOUS_POLL_TIMER)!();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);
  finish();
  await new Promise((resolve) => setImmediate(resolve));
});

test("shutdown removes future scheduling and waits for bounded active work", async () => {
  let finish!: () => void;
  const gate = new Promise<void>((resolve) => { finish = resolve; });
  const item = harness(true, async () => { await gate; return empty; });
  item.poller.onApplicationBootstrap();
  item.timeouts.get(POSITION_HISTORY_CONTINUOUS_STARTUP_TIMER)!();
  await new Promise((resolve) => setImmediate(resolve));
  let destroyed = false;
  const shutdown = item.poller.onModuleDestroy().then(() => { destroyed = true; });
  assert.equal(item.timeouts.size, 0); assert.equal(item.intervals.size, 0); assert.equal(destroyed, false);
  finish(); await shutdown; assert.equal(destroyed, true);
  await item.poller.poll();
  assert.equal(item.status.snapshot(true).cyclesStarted, 1);
});
