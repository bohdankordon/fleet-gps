import { z } from "zod";
import { parseVehicleTrackTimestamp } from "../vehicle-track/vehicle-track-range";

const count = z.number().int().nonnegative();
const timestamp = z.string().refine((value) => parseVehicleTrackTimestamp(value) !== null);
const nullableTimestamp = timestamp.nullable();
const percent = z.number().int().min(0).max(100).nullable();

const replayState = z.enum(["NOT_CREATED", "PENDING", "RUNNING", "COMPLETED"]);
const retentionOutcome = z.enum(["NOT_OBSERVED_THIS_PROCESS", "SUCCESS", "SKIPPED", "FAILED"]);
const retentionSkipCategory = z.enum(["LOCK_UNAVAILABLE", "ACTIVE_POPULATION"]).nullable();

const replaySummary = z.object({
  state: replayState,
  generationAnchor: nullableTimestamp,
  rangeFrom: nullableTimestamp,
  rangeTo: nullableTimestamp,
  checkpointsTotal: count,
  checkpointsCompleted: count,
  checkpointsRemaining: count,
  progressPercent: percent,
  isCurrent: z.boolean(),
  debtSuspected: z.boolean(),
  incompleteGenerations: count,
  overdueIncompleteGenerations: count,
  oldestIncompleteGenerationAnchor: nullableTimestamp,
  oldestOverdueGenerationAnchor: nullableTimestamp,
  hasReplayDebt: z.boolean(),
  activeGenerationAnchor: nullableTimestamp,
  activeState: replayState.nullable(),
  activeCheckpointsTotal: count,
  activeCheckpointsCompleted: count,
  activeCheckpointsRemaining: count,
  activeProgressPercent: percent,
  activeIsOverdue: z.boolean(),
  queuedIncompleteGenerations: count,
  estimatedRemainingWindows: count,
}).strict();

export const positionHistoryIngestionStatusSchema = z.object({
  generatedAt: timestamp,
  configuration: z.object({ continuousIngestionEnabled: z.boolean(), automaticRetentionEnabled: z.boolean() }).strict(),
  runtime: z.object({ pollerStarted: z.boolean(), cycleInFlight: z.boolean(), lastCycleStartedAt: nullableTimestamp, lastCycleCompletedAt: nullableTimestamp, processStartedAt: timestamp, cyclesCompletedSinceProcessStart: count, lastCycleDurationMs: count.nullable(), maxCycleDurationMsSinceProcessStart: count.nullable(), cyclesExceedingPollIntervalSinceProcessStart: count }).strict(),
  providerTraffic: z.object({ requestStartsLastMinute: count, requestStartsSinceProcessStart: count, retriesSinceProcessStart: count, rateLimitResponsesSinceProcessStart: count, provider5xxSinceProcessStart: count, networkFailuresSinceProcessStart: count, timeoutsSinceProcessStart: count, contractFailuresSinceProcessStart: count, storageFailuresSinceProcessStart: count, providerBlockedResponsesSinceProcessStart: count, unknownFailuresSinceProcessStart: count, lastFailureCategory: z.enum(["rate_limit", "provider_5xx", "network", "timeout", "contract", "storage", "provider_blocked", "unknown"]).nullable(), lastFailureAt: nullableTimestamp }).strict(),
  coordination: z.object({ historyLockContentionSinceProcessStart: count, providerBlockedStreams: count, durablePopulationActive: z.boolean() }).strict(),
  cursor: z.object({ mappedVehicles: count, cursorCount: count, missingCursorCount: count, medianLagSeconds: z.number().int().nonnegative().nullable(), worstLagSeconds: z.number().int().nonnegative().nullable(), oldestConfirmedThrough: nullableTimestamp, currentSafeBoundary: timestamp }).strict(),
  recentTail: z.object({ lastSuccessAt: nullableTimestamp, successesSinceProcessStart: count, failuresSinceProcessStart: count }).strict(),
  replay: z.object({ daily: replaySummary, rolling: replaySummary }).strict(),
  retention: z.object({ enabled: z.boolean(), running: z.boolean(), lastAttemptAt: nullableTimestamp, lastCompletedAt: nullableTimestamp, lastOutcome: retentionOutcome, lastSkipCategory: retentionSkipCategory, nextScheduledExecutionAt: nullableTimestamp, currentRetentionPolicyFloor: timestamp, cursorsBehindRetentionFloor: count, cursorsAtOrBeyondRetentionFloor: count, retentionFloorAligned: z.boolean() }).strict(),
  meta: z.object({ telemetryScope: z.string(), durableScope: z.string(), countersResetOnRestart: z.boolean() }).strict(),
}).strict().superRefine((value, context) => {
  for (const summary of [value.replay.daily, value.replay.rolling]) {
    if (summary.checkpointsCompleted + summary.checkpointsRemaining !== summary.checkpointsTotal) context.addIssue({ code: "custom", message: "replay checkpoint count" });
    if (summary.overdueIncompleteGenerations > summary.incompleteGenerations) context.addIssue({ code: "custom", message: "replay overdue count" });
    if (summary.hasReplayDebt !== (summary.overdueIncompleteGenerations > 0)) context.addIssue({ code: "custom", message: "replay debt flag" });
    if (summary.activeCheckpointsCompleted + summary.activeCheckpointsRemaining !== summary.activeCheckpointsTotal) context.addIssue({ code: "custom", message: "active replay checkpoint count" });
    if (summary.queuedIncompleteGenerations !== Math.max(0, summary.incompleteGenerations - (summary.activeGenerationAnchor === null ? 0 : 1))) context.addIssue({ code: "custom", message: "queued replay count" });
    if (summary.activeGenerationAnchor === null && (summary.activeState !== null || summary.activeCheckpointsTotal !== 0 || summary.activeProgressPercent !== null || summary.estimatedRemainingWindows !== 0)) context.addIssue({ code: "custom", message: "empty active replay" });
    if (summary.state === "NOT_CREATED") {
      if (summary.generationAnchor !== null || summary.checkpointsTotal !== 0 || summary.progressPercent !== null || summary.incompleteGenerations !== 0 || summary.hasReplayDebt) context.addIssue({ code: "custom", message: "replay empty state" });
    }
  }
  if (value.cursor.missingCursorCount !== Math.max(0, value.cursor.mappedVehicles - value.cursor.cursorCount)) context.addIssue({ code: "custom", message: "cursor missing count" });
  if (!value.retention.enabled && value.retention.nextScheduledExecutionAt !== null) context.addIssue({ code: "custom", message: "retention schedule" });
  if ((value.retention.lastOutcome === "NOT_OBSERVED_THIS_PROCESS") !== (value.retention.lastAttemptAt === null)) context.addIssue({ code: "custom", message: "retention observation" });
  if ((value.retention.lastSkipCategory !== null) !== (value.retention.lastOutcome === "SKIPPED")) context.addIssue({ code: "custom", message: "retention skip category" });
});

export type PositionHistoryIngestionStatusResponse = z.infer<typeof positionHistoryIngestionStatusSchema>;

export class PositionHistoryIngestionStatusContractError extends Error {
  public constructor() {
    super("Invalid position history ingestion status response");
    this.name = "PositionHistoryIngestionStatusContractError";
  }
}

export function parsePositionHistoryIngestionStatus(value: unknown): PositionHistoryIngestionStatusResponse {
  const parsed = positionHistoryIngestionStatusSchema.safeParse(value);
  if (!parsed.success) throw new PositionHistoryIngestionStatusContractError();
  return parsed.data;
}
