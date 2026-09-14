import assert from "node:assert/strict";
import test from "node:test";
import { PositionHistoryReplayKind } from "../../generated/prisma/client";
import type { PositionHistoryContinuousCycleResult } from "./position-history-continuous-ingestion.types";
import type { PositionHistoryContinuousIngestionWorkerService } from "./position-history-continuous-ingestion-worker.service";
import type { PositionHistoryReplayWorkerService } from "./position-history-replay-worker.service";
import { PositionHistoryWorkloadCoordinatorService } from "./position-history-workload-coordinator.service";

const empty = (overrides: Partial<PositionHistoryContinuousCycleResult> = {}): PositionHistoryContinuousCycleResult => ({ vehicles: 0, requests: 0, providerRows: 0, inserted: 0, duplicates: 0, invalid: 0, retries: 0, rateLimitResponses: 0, cursorAdvancements: 0, recentTailCompleted: 0, backlogCompleted: 0, providerBlocked: 0, failedWork: 0, lockUnavailable: 0, ...overrides });

test("coordinator gives continuous lanes two first opportunities, then daily before rolling", async () => {
  const calls: string[] = [];
  const continuous = { processCycle: async (limit: number) => { calls.push(`continuous:${limit}`); return empty(); } } as unknown as PositionHistoryContinuousIngestionWorkerService;
  const replay = { processKind: async (kind: PositionHistoryReplayKind) => { calls.push(kind); return { kind, outcome: "NO_WORK", generationAnchor: null, requests: 0, providerRows: 0, inserted: 0, duplicates: 0, invalid: 0, retries: 0, rateLimitResponses: 0, checkpointWindowsCompleted: 0, policyRetiredPrefixes: 0, checkpointsRemaining: null }; } } as unknown as PositionHistoryReplayWorkerService;
  await new PositionHistoryWorkloadCoordinatorService(continuous, replay).processCycle();
  assert.deepEqual(calls, ["continuous:2", PositionHistoryReplayKind.DAILY_7_DAY, PositionHistoryReplayKind.ROLLING_90_DAY]);
});

test("rate limiting or lock contention in higher-priority continuous work suppresses replay for that cycle", async () => {
  for (const result of [empty({ rateLimitResponses: 1 }), empty({ lockUnavailable: 1 })]) {
    let replayCalls = 0;
    const continuous = { processCycle: async () => result } as unknown as PositionHistoryContinuousIngestionWorkerService;
    const replay = { processKind: async () => { replayCalls += 1; throw new Error("must not run"); } } as unknown as PositionHistoryReplayWorkerService;
    assert.equal(await new PositionHistoryWorkloadCoordinatorService(continuous, replay).processCycle(), result);
    assert.equal(replayCalls, 0);
  }
});

test("daily rate limiting suppresses lower-priority rolling replay for that cycle", async () => {
  const calls: PositionHistoryReplayKind[] = [];
  const continuous = { processCycle: async () => empty() } as unknown as PositionHistoryContinuousIngestionWorkerService;
  const replay = { processKind: async (kind: PositionHistoryReplayKind) => {
    calls.push(kind);
    return { kind, outcome: "FAILED", generationAnchor: null, requests: 3, providerRows: 0, inserted: 0, duplicates: 0, invalid: 0, retries: 2, rateLimitResponses: 3, checkpointWindowsCompleted: 0, policyRetiredPrefixes: 0, checkpointsRemaining: 1 };
  } } as unknown as PositionHistoryReplayWorkerService;
  await new PositionHistoryWorkloadCoordinatorService(continuous, replay).processCycle();
  assert.deepEqual(calls, [PositionHistoryReplayKind.DAILY_7_DAY]);
});
