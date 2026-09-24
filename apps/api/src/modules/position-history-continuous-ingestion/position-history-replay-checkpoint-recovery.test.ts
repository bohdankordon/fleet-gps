import assert from "node:assert/strict";
import test from "node:test";
import { EquGpsHttpError, EquGpsRateLimitError, EquGpsTimeoutError } from "@taxi-gps/equgps";
import { PositionBackfillStatus, PositionHistoryReplayKind, PositionHistoryReplayRunStatus, type PositionHistoryReplayCheckpoint, type PositionHistoryReplayRun } from "../../generated/prisma/client";
import type { PositionHistoryHistoricalWindowService } from "../position-history-historical-window";
import type { PositionHistoryHorizonExecutionLockService } from "../position-history-horizon-execution/position-history-horizon-execution-lock.service";
import { PositionHistoryIngestionTelemetryService } from "../position-history-horizon-execution/position-history-ingestion-telemetry.service";
import type { PositionHistoryReplayRepository, PositionHistoryReplayRunStateService } from "../position-history-replay-generation";
import { PositionHistoryReplayWorkerService } from "./position-history-replay-worker.service";

const anchor = new Date("2026-09-14T02:00:00Z");
const from = new Date("2026-09-13T02:00:00Z");
const oldId = "123e4567-e89b-42d3-a456-426614174011";
const newId = "123e4567-e89b-42d3-a456-426614174012";
const firstId = "123e4567-e89b-42d3-a456-426614174013";
const secondId = "123e4567-e89b-42d3-a456-426614174014";
const firstVehicle = "123e4567-e89b-42d3-a456-426614174015";
const secondVehicle = "123e4567-e89b-42d3-a456-426614174016";

function recoveryHarness() {
  let nowMs = Date.parse("2026-09-14T03:00:00Z");
  const failures = new Map<number, unknown>();
  const requests: number[] = [];
  const runs: PositionHistoryReplayRun[] = [oldId, newId].map((id, index) => ({
    id, kind: PositionHistoryReplayKind.ROLLING_90_DAY, generationAnchor: new Date(anchor.getTime() + index * 7 * 86_400_000), rangeFrom: from, rangeTo: anchor,
    status: PositionHistoryReplayRunStatus.PENDING, leaseOwner: null, leaseExpiresAt: null, startedAt: null, completedAt: null, createdAt: anchor, updatedAt: anchor,
  }));
  const checkpoints: PositionHistoryReplayCheckpoint[] = [
    { id: firstId, runId: oldId, vehicleId: firstVehicle, rangeFrom: from, rangeTo: new Date(from.getTime() + 12 * 3_600_000), nextFrom: from, status: PositionBackfillStatus.PENDING, createdAt: anchor, updatedAt: anchor },
    { id: secondId, runId: oldId, vehicleId: secondVehicle, rangeFrom: from, rangeTo: new Date(from.getTime() + 6 * 3_600_000), nextFrom: from, status: PositionBackfillStatus.PENDING, createdAt: anchor, updatedAt: anchor },
  ];
  const eligible = () => checkpoints.filter((item) => item.runId === oldId && item.status !== PositionBackfillStatus.COMPLETED);
  const repository = {
    listEligibleVehicles: async () => [{ vehicleId: firstVehicle, externalDeviceId: 77, disabled: false }, { vehicleId: secondVehicle, externalDeviceId: 78, disabled: false }],
    ensureRun: async () => runs[1],
    findRun: async () => runs[1],
    countCheckpoints: async (runId: string) => checkpoints.filter((item) => item.runId === runId).length,
    listIncompleteCheckpoints: async (runId: string, limit: number) => checkpoints.filter((item) => item.runId === runId && item.status !== PositionBackfillStatus.COMPLETED).slice(0, limit),
    countIncompleteCheckpoints: async (runId: string) => checkpoints.filter((item) => item.runId === runId && item.status !== PositionBackfillStatus.COMPLETED).length,
    findMappedVehicle: async (vehicleId: string) => ({ vehicleId, externalDeviceId: vehicleId === firstVehicle ? 77 : 78, disabled: false }),
    persistReplayWindow: async (input: { checkpointId: string; expectedNextFrom: Date; nextFrom: Date }) => {
      const item = checkpoints.find((checkpoint) => checkpoint.id === input.checkpointId)!;
      assert.equal(item.nextFrom.getTime(), input.expectedNextFrom.getTime());
      item.nextFrom = input.nextFrom;
      item.status = input.nextFrom.getTime() === item.rangeTo.getTime() ? PositionBackfillStatus.COMPLETED : PositionBackfillStatus.RUNNING;
      return { inserted: 0, duplicates: 0, checkpointStatus: item.status };
    },
  } as unknown as PositionHistoryReplayRepository;
  const state = {
    findClaimable: async () => runs.find((run) => run.status === PositionHistoryReplayRunStatus.PENDING) ?? null,
    claimRun: async (input: { runId: string; leaseOwner: string; leaseExpiresAt: Date; now: Date }) => {
      const run = runs.find((item) => item.id === input.runId)!;
      run.status = PositionHistoryReplayRunStatus.RUNNING;
      run.leaseOwner = input.leaseOwner;
      run.leaseExpiresAt = input.leaseExpiresAt;
      run.startedAt ??= input.now;
      return run;
    },
    renewLease: async () => true,
    yieldRun: async (input: { runId: string }) => {
      const run = runs.find((item) => item.id === input.runId)!;
      run.status = PositionHistoryReplayRunStatus.PENDING;
      run.leaseOwner = null;
      run.leaseExpiresAt = null;
      return true;
    },
    completeRun: async (input: { runId: string }) => {
      assert.equal(checkpoints.filter((item) => item.runId === input.runId && item.status !== PositionBackfillStatus.COMPLETED).length, 0);
      runs.find((item) => item.id === input.runId)!.status = PositionHistoryReplayRunStatus.COMPLETED;
      return true;
    },
  } as unknown as PositionHistoryReplayRunStateService;
  const historical = { read: async (request: { externalDeviceId: number; from: Date; to: Date }, options: { beforeRequestStart?: () => Promise<void> }) => {
    await options.beforeRequestStart?.();
    requests.push(request.externalDeviceId);
    const failure = failures.get(request.externalDeviceId);
    if (failure !== undefined) throw failure;
    return { fetchFrom: request.from, fetchTo: request.to, fetchedAt: new Date(nowMs), providerRows: 0, candidates: [], skippedInvalid: 0, requests: 1, retries: 0, rateLimitResponses: 0 };
  } } as unknown as PositionHistoryHistoricalWindowService;
  const clock = { now: () => new Date(nowMs) };
  const sleeper = { sleep: async (durationMs: number) => { nowMs += durationMs; } };
  const lock = { runExclusive: async <T>(work: () => Promise<T>) => work() } as PositionHistoryHorizonExecutionLockService;
  const worker = new PositionHistoryReplayWorkerService(repository, state, historical, lock, clock, sleeper, { start: () => () => undefined }, new PositionHistoryIngestionTelemetryService(clock));
  return { worker, runs, checkpoints, requests, failures, eligible, now: () => nowMs, advance: (ms: number) => { nowMs += ms; } };
}

test("scoped timeout leaves failed checkpoint durable, then another checkpoint advances in oldest generation", async () => {
  const item = recoveryHarness();
  item.failures.set(77, new EquGpsTimeoutError("getHistoricalPositions"));
  assert.equal((await item.worker.processKind(PositionHistoryReplayKind.ROLLING_90_DAY)).outcome, "FAILED");
  assert.deepEqual([item.checkpoints[0]!.nextFrom.getTime(), item.checkpoints[0]!.status, item.runs[0]!.status], [from.getTime(), PositionBackfillStatus.PENDING, PositionHistoryReplayRunStatus.PENDING]);
  assert.equal((await item.worker.processKind(PositionHistoryReplayKind.ROLLING_90_DAY)).outcome, "COMPLETED_WINDOW");
  assert.deepEqual(item.requests, [77, 78]);
  assert.equal(item.checkpoints[1]!.status, PositionBackfillStatus.COMPLETED);
  assert.equal(item.runs[1]!.status, PositionHistoryReplayRunStatus.PENDING);
  item.failures.delete(77);
  item.advance(60_000);
  assert.equal((await item.worker.processKind(PositionHistoryReplayKind.ROLLING_90_DAY)).outcome, "COMPLETED_WINDOW");
  assert.deepEqual(item.requests, [77, 78, 77]);
  assert.equal(item.checkpoints[0]!.status, PositionBackfillStatus.RUNNING);
  item.failures.set(77, new EquGpsTimeoutError("getHistoricalPositions"));
  assert.equal((await item.worker.processKind(PositionHistoryReplayKind.ROLLING_90_DAY)).outcome, "FAILED");
  item.advance(60_000);
  item.failures.delete(77);
  assert.equal((await item.worker.processKind(PositionHistoryReplayKind.ROLLING_90_DAY)).outcome, "COMPLETED_RUN", "success reset the checkpoint's failure count to a one-minute retry");
  assert.equal(item.runs[0]!.status, PositionHistoryReplayRunStatus.COMPLETED);
});

test("repeated scoped failure backs off exponentially and all-backed-off run starts no request", async () => {
  const item = recoveryHarness();
  item.failures.set(77, new EquGpsTimeoutError());
  item.failures.set(78, new EquGpsTimeoutError());
  assert.equal((await item.worker.processKind(PositionHistoryReplayKind.ROLLING_90_DAY)).outcome, "FAILED");
  assert.equal((await item.worker.processKind(PositionHistoryReplayKind.ROLLING_90_DAY)).outcome, "FAILED");
  const before = item.requests.length;
  assert.equal((await item.worker.processKind(PositionHistoryReplayKind.ROLLING_90_DAY)).outcome, "YIELDED");
  assert.equal(item.requests.length, before);
  item.advance(60_000);
  assert.equal((await item.worker.processKind(PositionHistoryReplayKind.ROLLING_90_DAY)).outcome, "FAILED");
  const after = item.requests.length;
  item.advance(60_000);
  assert.equal((await item.worker.processKind(PositionHistoryReplayKind.ROLLING_90_DAY)).outcome, "FAILED", "second checkpoint may retry while the first has a two-minute backoff");
  assert.equal(item.requests.length, after + 1);
});

test("checkpoint retry delay doubles to the bounded thirty-minute maximum", async () => {
  const item = recoveryHarness();
  item.checkpoints[1]!.status = PositionBackfillStatus.COMPLETED;
  item.failures.set(77, new EquGpsTimeoutError());
  for (const delay of [60_000, 120_000, 240_000, 480_000, 960_000, 1_800_000, 1_800_000]) {
    assert.equal((await item.worker.processKind(PositionHistoryReplayKind.ROLLING_90_DAY)).outcome, "FAILED");
    const retry = (item.worker as any).checkpointNextEligible.get(firstId) as { at: number };
    // The pacer cools for two seconds after scheduling while still holding the lock.
    assert.equal(retry.at - item.now(), delay - 2_000);
    item.advance(delay);
  }
  assert.equal(item.checkpoints[0]!.nextFrom.getTime(), from.getTime());
  assert.equal(item.runs[1]!.status, PositionHistoryReplayRunStatus.PENDING);
});

for (const failure of [new EquGpsRateLimitError(), new EquGpsHttpError(401), new EquGpsHttpError(403), new Error("internal storage failure")]) {
  test(`${failure.name} keeps shared/internal failures run-wide`, async () => {
    const item = recoveryHarness();
    item.failures.set(77, failure);
    assert.equal((await item.worker.processKind(PositionHistoryReplayKind.ROLLING_90_DAY)).outcome, "FAILED");
    assert.equal((await item.worker.processKind(PositionHistoryReplayKind.ROLLING_90_DAY)).outcome, "NO_WORK");
    assert.deepEqual(item.requests, [77]);
    assert.equal(item.checkpoints[0]!.nextFrom.getTime(), from.getTime());
    assert.equal(item.runs[1]!.status, PositionHistoryReplayRunStatus.PENDING);
  });
}

for (const failure of [new EquGpsHttpError(503), new EquGpsHttpError(400)]) {
  test(`${failure.name} ${failure.status} backs off only the affected checkpoint`, async () => {
    const item = recoveryHarness();
    item.failures.set(77, failure);
    assert.equal((await item.worker.processKind(PositionHistoryReplayKind.ROLLING_90_DAY)).outcome, "FAILED");
    assert.equal((await item.worker.processKind(PositionHistoryReplayKind.ROLLING_90_DAY)).outcome, "COMPLETED_WINDOW");
    assert.deepEqual(item.requests, [77, 78]);
    assert.equal(item.checkpoints[0]!.nextFrom.getTime(), from.getTime());
  });
}
