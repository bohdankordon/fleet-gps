import type { PositionHistoryIngestionStatusResponse } from "./position-history-ingestion-status-contract";

type ReplaySummary = PositionHistoryIngestionStatusResponse["replay"]["daily"];

const base: PositionHistoryIngestionStatusResponse = {
    generatedAt: "2026-09-14T12:00:00.000Z",
    configuration: { continuousIngestionEnabled: false, automaticRetentionEnabled: false },
    runtime: { pollerStarted: false, cycleInFlight: false, lastCycleStartedAt: null, lastCycleCompletedAt: null, processStartedAt: "2026-09-14T12:00:00.000Z" },
    providerTraffic: { requestStartsLastMinute: 0, requestStartsSinceProcessStart: 0, retriesSinceProcessStart: 0, rateLimitResponsesSinceProcessStart: 0, provider5xxSinceProcessStart: 0, networkFailuresSinceProcessStart: 0, timeoutsSinceProcessStart: 0, contractFailuresSinceProcessStart: 0, storageFailuresSinceProcessStart: 0, providerBlockedResponsesSinceProcessStart: 0, unknownFailuresSinceProcessStart: 0 },
    coordination: { historyLockContentionSinceProcessStart: 0, providerBlockedStreams: 0, durablePopulationActive: false },
    cursor: { mappedVehicles: 0, cursorCount: 0, missingCursorCount: 0, medianLagSeconds: null, worstLagSeconds: null, oldestConfirmedThrough: null, currentSafeBoundary: "2026-09-14T11:58:00.000Z" },
    recentTail: { lastSuccessAt: null, successesSinceProcessStart: 0, failuresSinceProcessStart: 0 },
    replay: {
      daily: { state: "NOT_CREATED", generationAnchor: null, rangeFrom: null, rangeTo: null, checkpointsTotal: 0, checkpointsCompleted: 0, checkpointsRemaining: 0, progressPercent: null, isCurrent: false, debtSuspected: false, incompleteGenerations: 0, overdueIncompleteGenerations: 0, oldestIncompleteGenerationAnchor: null, oldestOverdueGenerationAnchor: null, hasReplayDebt: false },
      rolling: { state: "NOT_CREATED", generationAnchor: null, rangeFrom: null, rangeTo: null, checkpointsTotal: 0, checkpointsCompleted: 0, checkpointsRemaining: 0, progressPercent: null, isCurrent: false, debtSuspected: false, incompleteGenerations: 0, overdueIncompleteGenerations: 0, oldestIncompleteGenerationAnchor: null, oldestOverdueGenerationAnchor: null, hasReplayDebt: false },
    },
    retention: { enabled: false, running: false, lastAttemptAt: null, lastCompletedAt: null, lastOutcome: "NOT_OBSERVED_THIS_PROCESS", lastSkipCategory: null, nextScheduledExecutionAt: null, currentRetentionPolicyFloor: "2026-06-15T02:00:00.000Z", cursorsBehindRetentionFloor: 0, cursorsAtOrBeyondRetentionFloor: 0, retentionFloorAligned: false },
    meta: { telemetryScope: "process-local", durableScope: "database", countersResetOnRestart: true },
};

const emptyReplay: ReplaySummary = { state: "NOT_CREATED", generationAnchor: null, rangeFrom: null, rangeTo: null, checkpointsTotal: 0, checkpointsCompleted: 0, checkpointsRemaining: 0, progressPercent: null, isCurrent: false, debtSuspected: false, incompleteGenerations: 0, overdueIncompleteGenerations: 0, oldestIncompleteGenerationAnchor: null, oldestOverdueGenerationAnchor: null, hasReplayDebt: false };

export function positionHistoryIngestionStatusFixture(): PositionHistoryIngestionStatusResponse {
  return { ...base, configuration: { ...base.configuration }, runtime: { ...base.runtime }, providerTraffic: { ...base.providerTraffic }, coordination: { ...base.coordination }, cursor: { ...base.cursor }, recentTail: { ...base.recentTail }, replay: { daily: { ...emptyReplay }, rolling: { ...emptyReplay } }, retention: { ...base.retention }, meta: { ...base.meta } };
}

export type PositionHistoryIngestionStatusState = "CURRENT" | "REPLAYING" | "DEBT";

/**
 * Representative operational states for human visual review and focused rendering tests. Every state
 * satisfies the strict ingestion-status contract.
 */
export function positionHistoryIngestionStatusStateFixture(state: PositionHistoryIngestionStatusState): PositionHistoryIngestionStatusResponse {
  const healthy: PositionHistoryIngestionStatusResponse = {
    ...base,
    configuration: { continuousIngestionEnabled: true, automaticRetentionEnabled: true },
    runtime: { pollerStarted: true, cycleInFlight: false, lastCycleStartedAt: "2026-09-14T11:59:40.000Z", lastCycleCompletedAt: "2026-09-14T11:59:52.000Z", processStartedAt: "2026-09-12T04:10:00.000Z" },
    providerTraffic: { requestStartsLastMinute: 18, requestStartsSinceProcessStart: 41230, retriesSinceProcessStart: 96, rateLimitResponsesSinceProcessStart: 4, provider5xxSinceProcessStart: 1, networkFailuresSinceProcessStart: 2, timeoutsSinceProcessStart: 0, contractFailuresSinceProcessStart: 0, storageFailuresSinceProcessStart: 0, providerBlockedResponsesSinceProcessStart: 3, unknownFailuresSinceProcessStart: 0 },
    coordination: { historyLockContentionSinceProcessStart: 7, providerBlockedStreams: 1, durablePopulationActive: false },
    cursor: { mappedVehicles: 58, cursorCount: 58, missingCursorCount: 0, medianLagSeconds: 240, worstLagSeconds: 1860, oldestConfirmedThrough: "2026-09-14T11:30:00.000Z", currentSafeBoundary: "2026-09-14T11:58:00.000Z" },
    recentTail: { lastSuccessAt: "2026-09-14T11:59:52.000Z", successesSinceProcessStart: 3874, failuresSinceProcessStart: 2 },
    retention: { enabled: true, running: false, lastAttemptAt: "2026-09-14T06:00:03.000Z", lastCompletedAt: "2026-09-14T06:00:41.000Z", lastOutcome: "SUCCESS", lastSkipCategory: null, nextScheduledExecutionAt: "2026-09-15T06:00:00.000Z", currentRetentionPolicyFloor: "2026-06-16T06:00:00.000Z", cursorsBehindRetentionFloor: 0, cursorsAtOrBeyondRetentionFloor: 58, retentionFloorAligned: true },
  };
  const daily: ReplaySummary = { state: "COMPLETED", generationAnchor: "2026-09-14T02:00:00.000Z", rangeFrom: "2026-09-07T02:00:00.000Z", rangeTo: "2026-09-14T02:00:00.000Z", checkpointsTotal: 58, checkpointsCompleted: 58, checkpointsRemaining: 0, progressPercent: 100, isCurrent: true, debtSuspected: false, incompleteGenerations: 0, overdueIncompleteGenerations: 0, oldestIncompleteGenerationAnchor: null, oldestOverdueGenerationAnchor: null, hasReplayDebt: false };
  const rolling: ReplaySummary = { state: "COMPLETED", generationAnchor: "2026-09-08T02:00:00.000Z", rangeFrom: "2026-06-10T02:00:00.000Z", rangeTo: "2026-09-08T02:00:00.000Z", checkpointsTotal: 754, checkpointsCompleted: 754, checkpointsRemaining: 0, progressPercent: 100, isCurrent: true, debtSuspected: false, incompleteGenerations: 0, overdueIncompleteGenerations: 0, oldestIncompleteGenerationAnchor: null, oldestOverdueGenerationAnchor: null, hasReplayDebt: false };
  if (state === "CURRENT") return { ...healthy, replay: { daily: { ...daily }, rolling: { ...rolling } } };
  if (state === "REPLAYING") return {
    ...healthy,
    coordination: { ...healthy.coordination, durablePopulationActive: true },
    replay: {
      daily: { ...daily, state: "RUNNING", checkpointsCompleted: 35, checkpointsRemaining: 23, progressPercent: 60, isCurrent: true },
      rolling: { ...rolling, state: "RUNNING", generationAnchor: "2026-09-15T02:00:00.000Z", rangeFrom: "2026-06-17T02:00:00.000Z", rangeTo: "2026-09-15T02:00:00.000Z", checkpointsCompleted: 121, checkpointsRemaining: 633, progressPercent: 16, isCurrent: true },
    },
  };
  return {
    ...healthy,
    retention: { ...healthy.retention, lastAttemptAt: "2026-09-14T06:00:03.000Z", lastCompletedAt: null, lastOutcome: "SKIPPED", lastSkipCategory: "LOCK_UNAVAILABLE" },
    replay: {
      daily: { ...daily, state: "RUNNING", checkpointsCompleted: 12, checkpointsRemaining: 46, progressPercent: 20, isCurrent: false, debtSuspected: true, incompleteGenerations: 3, overdueIncompleteGenerations: 2, oldestIncompleteGenerationAnchor: "2026-09-11T02:00:00.000Z", oldestOverdueGenerationAnchor: "2026-09-11T02:00:00.000Z", hasReplayDebt: true },
      rolling: { ...rolling, state: "PENDING", generationAnchor: "2026-09-08T02:00:00.000Z", rangeFrom: "2026-06-10T02:00:00.000Z", rangeTo: "2026-09-08T02:00:00.000Z", checkpointsCompleted: 0, checkpointsRemaining: 754, progressPercent: 0, isCurrent: false, debtSuspected: true, incompleteGenerations: 1, overdueIncompleteGenerations: 1, oldestIncompleteGenerationAnchor: "2026-09-08T02:00:00.000Z", oldestOverdueGenerationAnchor: "2026-09-08T02:00:00.000Z", hasReplayDebt: true },
    },
  };
}
