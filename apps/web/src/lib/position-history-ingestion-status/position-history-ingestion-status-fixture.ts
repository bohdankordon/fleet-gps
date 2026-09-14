import type { PositionHistoryIngestionStatusResponse } from "./position-history-ingestion-status-contract";

export function positionHistoryIngestionStatusFixture(): PositionHistoryIngestionStatusResponse {
  return {
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
}
