import assert from "node:assert/strict";
import test from "node:test";
import { PositionHistoryReplayKind } from "../../generated/prisma/client";
import type { PositionHistoryContinuousCycleResult, PositionHistoryContinuousLane } from "./position-history-continuous-ingestion.types";
import type { PositionHistoryContinuousIngestionWorkerService } from "./position-history-continuous-ingestion-worker.service";
import type { PositionHistoryReplayWorkerService } from "./position-history-replay-worker.service";
import { PositionHistoryWorkloadCoordinatorService } from "./position-history-workload-coordinator.service";

const empty = (overrides: Partial<PositionHistoryContinuousCycleResult> = {}): PositionHistoryContinuousCycleResult => ({ vehicles: 0, requests: 0, providerRows: 0, inserted: 0, duplicates: 0, invalid: 0, retries: 0, rateLimitResponses: 0, cursorAdvancements: 0, recentTailCompleted: 0, backlogCompleted: 0, providerBlocked: 0, failedWork: 0, lockUnavailable: 0, ...overrides });
const replayResult = (kind: PositionHistoryReplayKind) => ({ kind, outcome: "COMPLETED_WINDOW" as const, generationAnchor: null, requests: 1, providerRows: 0, inserted: 0, duplicates: 0, invalid: 0, retries: 0, rateLimitResponses: 0, checkpointWindowsCompleted: 1, policyRetiredPrefixes: 0, checkpointsRemaining: 1 });

test("coordinator makes all five cycle opportunities available to continuous work when replay is not due", async () => {
  const calls: Array<{ limit: number; lanes: readonly PositionHistoryContinuousLane[] | undefined }> = [];
  const continuous = { processCycle: async (limit: number, lanes?: readonly PositionHistoryContinuousLane[]) => {
    calls.push({ limit, lanes });
    return empty({ requests: limit });
  } } as unknown as PositionHistoryContinuousIngestionWorkerService;
  const replay = {
    inspectPressure: async () => ({ due: false, overdue: false }),
    processKind: async () => { throw new Error("replay must not run"); },
  } as unknown as PositionHistoryReplayWorkerService;
  const result = await new PositionHistoryWorkloadCoordinatorService(continuous, replay).processCycle();
  assert.equal(result.requests, 5);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.limit, 5);
  assert.ok(calls[0]!.lanes?.includes("RECENT_TAIL"));
  assert.ok(calls[0]!.lanes?.includes("CONTIGUOUS_BACKLOG"));
});

test("due replay receives deterministic service while each cycle remains bounded to five request starts", async () => {
  const cycleStarts: number[] = [];
  const replayKinds: PositionHistoryReplayKind[] = [];
  let starts = 0;
  const continuous = { processCycle: async (limit: number) => { starts += limit; return empty({ requests: limit }); } } as unknown as PositionHistoryContinuousIngestionWorkerService;
  const replay = {
    inspectPressure: async () => ({ due: true, overdue: false }),
    processKind: async (kind: PositionHistoryReplayKind) => { replayKinds.push(kind); starts += 1; return replayResult(kind); },
  } as unknown as PositionHistoryReplayWorkerService;
  const coordinator = new PositionHistoryWorkloadCoordinatorService(continuous, replay);
  for (let cycle = 0; cycle < 20; cycle += 1) {
    const before = starts;
    await coordinator.processCycle(cycle * 10_500);
    cycleStarts.push(starts - before);
  }
  assert.ok(cycleStarts.every((value) => value === 5));
  assert.ok(replayKinds.includes(PositionHistoryReplayKind.DAILY_7_DAY));
  assert.ok(replayKinds.includes(PositionHistoryReplayKind.ROLLING_90_DAY));
});

test("rate limiting or lock contention in higher-priority continuous work suppresses replay for that cycle", async () => {
  for (const result of [empty({ rateLimitResponses: 1, requests: 1 }), empty({ lockUnavailable: 1 })]) {
    let replayCalls = 0;
    const continuous = { processCycle: async () => result } as unknown as PositionHistoryContinuousIngestionWorkerService;
    const replay = {
      inspectPressure: async () => ({ due: true, overdue: true }),
      processKind: async () => { replayCalls += 1; throw new Error("must not run"); },
    } as unknown as PositionHistoryReplayWorkerService;
    assert.equal(await new PositionHistoryWorkloadCoordinatorService(continuous, replay).processCycle(), result);
    assert.equal(replayCalls, 0);
  }
});
