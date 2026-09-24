import { Inject, Injectable } from "@nestjs/common";
import { PositionBackfillStatus, PositionHistoryPopulationRunStatus, PositionHistoryReplayKind, PositionHistoryReplayRunStatus } from "../../generated/prisma/client";
import type { ApiConfig } from "../../config/api-config";
import { API_CONFIG } from "../../config/api-config.tokens";
import { DatabaseService } from "../database/database.service";
import { PositionHistoryIngestionTelemetryService, type PositionHistoryIngestionFailureCategory } from "../position-history-horizon-execution/position-history-ingestion-telemetry.service";
import { POSITION_HISTORY_CONTINUOUS_FINALITY_DELAY_MS } from "../position-history-continuous-ingestion/position-history-continuous-ingestion.constants";
import { positionHistoryReplayTarget } from "../position-history-continuous-ingestion/position-history-replay-planning";
import { positionHistoryPolicyFloor } from "../position-history-horizon/position-history-policy-floor";
import { nextAutomaticPositionHistoryRetentionExecutionAt } from "../position-history-retention/position-history-retention-maintenance.service";

export type PositionHistoryIngestionReplayState = "NOT_CREATED" | "PENDING" | "RUNNING" | "COMPLETED";

export type PositionHistoryIngestionReplaySummary = Readonly<{
  state: PositionHistoryIngestionReplayState;
  generationAnchor: string | null;
  rangeFrom: string | null;
  rangeTo: string | null;
  checkpointsTotal: number;
  checkpointsCompleted: number;
  checkpointsRemaining: number;
  progressPercent: number | null;
  isCurrent: boolean;
  debtSuspected: boolean;
  incompleteGenerations: number;
  overdueIncompleteGenerations: number;
  oldestIncompleteGenerationAnchor: string | null;
  oldestOverdueGenerationAnchor: string | null;
  hasReplayDebt: boolean;
  /** Oldest durably incomplete generation; it may be backed off while newer work runs. */
  activeGenerationAnchor: string | null;
  activeState: PositionHistoryIngestionReplayState | null;
  activeCheckpointsTotal: number;
  activeCheckpointsCompleted: number;
  activeCheckpointsRemaining: number;
  activeProgressPercent: number | null;
  activeIsOverdue: boolean;
  /** Number of newer incomplete generations, which may also receive work. */
  queuedIncompleteGenerations: number;
  /** Six-hour windows at best; adaptive fallback and retries can require more requests. */
  estimatedRemainingWindows: number;
}>;

export type PositionHistoryIngestionStatusResponse = Readonly<{
  generatedAt: string;
  configuration: Readonly<{ continuousIngestionEnabled: boolean; automaticRetentionEnabled: boolean }>;
  runtime: Readonly<{
    pollerStarted: boolean;
    cycleInFlight: boolean;
    lastCycleStartedAt: string | null;
    lastCycleCompletedAt: string | null;
    processStartedAt: string;
    cyclesCompletedSinceProcessStart: number;
    lastCycleDurationMs: number | null;
    maxCycleDurationMsSinceProcessStart: number | null;
    cyclesExceedingPollIntervalSinceProcessStart: number;
  }>;
  providerTraffic: Readonly<{
    requestStartsLastMinute: number;
    requestStartsSinceProcessStart: number;
    retriesSinceProcessStart: number;
    rateLimitResponsesSinceProcessStart: number;
    provider5xxSinceProcessStart: number;
    networkFailuresSinceProcessStart: number;
    timeoutsSinceProcessStart: number;
    contractFailuresSinceProcessStart: number;
    storageFailuresSinceProcessStart: number;
    providerBlockedResponsesSinceProcessStart: number;
    unknownFailuresSinceProcessStart: number;
    lastFailureCategory: PositionHistoryIngestionFailureCategory | null;
    lastFailureAt: string | null;
  }>;
  coordination: Readonly<{ historyLockContentionSinceProcessStart: number; providerBlockedStreams: number; durablePopulationActive: boolean }>;
  cursor: Readonly<{
    mappedVehicles: number;
    cursorCount: number;
    missingCursorCount: number;
    medianLagSeconds: number | null;
    worstLagSeconds: number | null;
    oldestConfirmedThrough: string | null;
    currentSafeBoundary: string;
  }>;
  recentTail: Readonly<{ lastSuccessAt: string | null; successesSinceProcessStart: number; failuresSinceProcessStart: number }>;
  replay: Readonly<{ daily: PositionHistoryIngestionReplaySummary; rolling: PositionHistoryIngestionReplaySummary }>;
  retention: Readonly<{
    enabled: boolean;
    running: boolean;
    lastAttemptAt: string | null;
    lastCompletedAt: string | null;
    lastOutcome: "NOT_OBSERVED_THIS_PROCESS" | "SUCCESS" | "SKIPPED" | "FAILED";
    lastSkipCategory: "LOCK_UNAVAILABLE" | "ACTIVE_POPULATION" | null;
    nextScheduledExecutionAt: string | null;
    currentRetentionPolicyFloor: string;
    cursorsBehindRetentionFloor: number;
    cursorsAtOrBeyondRetentionFloor: number;
    retentionFloorAligned: boolean;
  }>;
  meta: Readonly<{ telemetryScope: string; durableScope: string; countersResetOnRestart: boolean }>;
}>;
export function summarizeCursorLag(input: Readonly<{ confirmedThrough: Date }[]>, mappedVehicleCount: number, safeBoundary: Date): Readonly<{
  mappedVehicles: number;
  cursorCount: number;
  missingCursorCount: number;
  medianLagSeconds: number | null;
  worstLagSeconds: number | null;
  oldestConfirmedThrough: Date | null;
}> {
  const safeCount = Number.isSafeInteger(mappedVehicleCount) && mappedVehicleCount >= 0 ? mappedVehicleCount : 0;
  const cursors = [...input];
  const cursorCount = cursors.length;
  const missingCursorCount = Math.max(0, safeCount - cursorCount);
  if (cursorCount === 0) {
    return Object.freeze({ mappedVehicles: safeCount, cursorCount: 0, missingCursorCount: missingCursorCount, medianLagSeconds: null, worstLagSeconds: null, oldestConfirmedThrough: null });
  }
  const boundaryMs = safeBoundary.getTime();
  const lags: number[] = [];
  let oldest: Date | null = null;
  for (const cursor of cursors) {
    const confirmed = cursor.confirmedThrough.getTime();
    if (!Number.isFinite(confirmed)) continue;
    lags.push(Math.max(0, Math.floor((boundaryMs - confirmed) / 1000)));
    if (oldest === null || confirmed < oldest.getTime()) oldest = new Date(confirmed);
  }
  if (lags.length === 0) {
    return Object.freeze({ mappedVehicles: safeCount, cursorCount, missingCursorCount, medianLagSeconds: null, worstLagSeconds: null, oldestConfirmedThrough: null });
  }
  lags.sort((left, right) => left - right);
  const middle = Math.floor(lags.length / 2);
  const median = lags.length % 2 === 1 ? lags[middle]! : Math.floor((lags[middle - 1]! + lags[middle]!) / 2);
  const worst = lags[lags.length - 1]!;
  return Object.freeze({ mappedVehicles: safeCount, cursorCount, missingCursorCount, medianLagSeconds: median, worstLagSeconds: worst, oldestConfirmedThrough: oldest });
}

export function replayProgress(checkpointsTotal: number, checkpointsRemaining: number): Readonly<{ completed: number; remaining: number; progressPercent: number | null }> {
  const total = Number.isSafeInteger(checkpointsTotal) && checkpointsTotal >= 0 ? checkpointsTotal : 0;
  const remaining = Number.isSafeInteger(checkpointsRemaining) && checkpointsRemaining >= 0 ? Math.min(checkpointsRemaining, total) : total;
  const completed = total - remaining;
  if (total === 0) return Object.freeze({ completed: 0, remaining: 0, progressPercent: null });
  return Object.freeze({ completed, remaining, progressPercent: Math.floor((completed / total) * 100) });
}
export function estimatedReplayRemainingWindows(checkpoints: readonly Readonly<{ nextFrom: Date; rangeTo: Date }>[]): number {
  return checkpoints.reduce((total, checkpoint) => total + Math.ceil(Math.max(0, checkpoint.rangeTo.getTime() - checkpoint.nextFrom.getTime()) / (6 * 60 * 60_000)), 0);
}
export function summarizeRetentionFloorAlignment(input: Readonly<{ coverageFrom: Date }>[], mappedVehicleCount: number, policyFloor: Date): Readonly<{ behind: number; atOrBeyond: number; aligned: boolean }> {
  const safeCount = Number.isSafeInteger(mappedVehicleCount) && mappedVehicleCount >= 0 ? mappedVehicleCount : 0;
  const floorMs = policyFloor.getTime();
  if (!Number.isFinite(floorMs) || input.length === 0) return Object.freeze({ behind: 0, atOrBeyond: 0, aligned: false });
  let behind = 0;
  let atOrBeyond = 0;
  for (const cursor of input) {
    const coverage = cursor.coverageFrom.getTime();
    if (!Number.isFinite(coverage)) continue;
    if (coverage < floorMs) behind += 1;
    else atOrBeyond += 1;
  }
  const total = behind + atOrBeyond;
  return Object.freeze({ behind, atOrBeyond, aligned: input.length === safeCount && safeCount > 0 && behind === 0 && behind + atOrBeyond === input.length });
}
@Injectable()
export class PositionHistoryIngestionStatusService {
  public constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly database: DatabaseService,
    private readonly telemetry: PositionHistoryIngestionTelemetryService,
  ) {}

  public async inspect(now?: Date): Promise<PositionHistoryIngestionStatusResponse> {
    const effectiveNow = now instanceof Date ? new Date(now.getTime()) : new Date();
    if (!Number.isFinite(effectiveNow.getTime())) throw new Error("Invalid ingestion status instant.");
    const generatedAt = new Date(effectiveNow.getTime());
    const safeBoundary = new Date(generatedAt.getTime() - POSITION_HISTORY_CONTINUOUS_FINALITY_DELAY_MS);
    const telemetrySnapshot = this.telemetry.snapshot(generatedAt);
    const continuousEnabled = this.config.positionHistoryContinuousIngestion?.enabled === true;
    const retentionEnabled = this.config.positionHistoryRetention?.enabled === true;
    const client = this.database.getClient();

    const mappedVehicles = await client.vehicle.count();
    const cursors = await client.vehicleHistoryIngestionCursor.findMany({ select: { confirmedThrough: true, coverageFrom: true } });
    const cursorSummary = summarizeCursorLag(cursors, mappedVehicles, safeBoundary);
    const policyFloor = positionHistoryPolicyFloor(generatedAt);
    const floorAlignment = summarizeRetentionFloorAlignment(cursors, mappedVehicles, policyFloor);

    const daily = await this.inspectReplay(client, PositionHistoryReplayKind.DAILY_7_DAY, safeBoundary);
    const rolling = await this.inspectReplay(client, PositionHistoryReplayKind.ROLLING_90_DAY, safeBoundary);

    const populationActive = (await client.positionHistoryPopulationRun.findFirst({
      where: { status: { in: [PositionHistoryPopulationRunStatus.PENDING, PositionHistoryPopulationRunStatus.RUNNING] } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true },
    })) !== null;

    return Object.freeze({
      generatedAt: generatedAt.toISOString(),
      configuration: Object.freeze({ continuousIngestionEnabled: continuousEnabled, automaticRetentionEnabled: retentionEnabled }),
      runtime: Object.freeze({
        pollerStarted: telemetrySnapshot.pollerStarted,
        cycleInFlight: telemetrySnapshot.cycleInFlight,
        lastCycleStartedAt: telemetrySnapshot.lastCycleStartedAt?.toISOString() ?? null,
        lastCycleCompletedAt: telemetrySnapshot.lastCycleCompletedAt?.toISOString() ?? null,
        processStartedAt: telemetrySnapshot.processStartedAt.toISOString(),
        cyclesCompletedSinceProcessStart: telemetrySnapshot.cyclesCompletedSinceProcessStart,
        lastCycleDurationMs: telemetrySnapshot.lastCycleDurationMs,
        maxCycleDurationMsSinceProcessStart: telemetrySnapshot.maxCycleDurationMsSinceProcessStart,
        cyclesExceedingPollIntervalSinceProcessStart: telemetrySnapshot.cyclesExceedingPollIntervalSinceProcessStart,
      }),
      providerTraffic: Object.freeze({
        requestStartsLastMinute: telemetrySnapshot.requestStartsLastMinute,
        requestStartsSinceProcessStart: telemetrySnapshot.requestStartsSinceProcessStart,
        retriesSinceProcessStart: telemetrySnapshot.retriesSinceProcessStart,
        rateLimitResponsesSinceProcessStart: telemetrySnapshot.rateLimitResponsesSinceProcessStart,
        provider5xxSinceProcessStart: telemetrySnapshot.provider5xxSinceProcessStart,
        networkFailuresSinceProcessStart: telemetrySnapshot.networkFailuresSinceProcessStart,
        timeoutsSinceProcessStart: telemetrySnapshot.timeoutsSinceProcessStart,
        contractFailuresSinceProcessStart: telemetrySnapshot.contractFailuresSinceProcessStart,
        storageFailuresSinceProcessStart: telemetrySnapshot.storageFailuresSinceProcessStart,
        providerBlockedResponsesSinceProcessStart: telemetrySnapshot.providerBlockedResponsesSinceProcessStart,
        unknownFailuresSinceProcessStart: telemetrySnapshot.unknownFailuresSinceProcessStart,
        lastFailureCategory: telemetrySnapshot.lastSafeFailureCategory,
        lastFailureAt: telemetrySnapshot.lastSafeFailureAt?.toISOString() ?? null,
      }),
      coordination: Object.freeze({
        historyLockContentionSinceProcessStart: telemetrySnapshot.historyLockContentionSinceProcessStart,
        providerBlockedStreams: telemetrySnapshot.providerBlockedStreams,
        durablePopulationActive: populationActive,
      }),
      cursor: Object.freeze({
        mappedVehicles: cursorSummary.mappedVehicles,
        cursorCount: cursorSummary.cursorCount,
        missingCursorCount: cursorSummary.missingCursorCount,
        medianLagSeconds: cursorSummary.medianLagSeconds,
        worstLagSeconds: cursorSummary.worstLagSeconds,
        oldestConfirmedThrough: cursorSummary.oldestConfirmedThrough?.toISOString() ?? null,
        currentSafeBoundary: safeBoundary.toISOString(),
      }),
      recentTail: Object.freeze({
        lastSuccessAt: telemetrySnapshot.lastRecentTailSuccessAt?.toISOString() ?? null,
        successesSinceProcessStart: telemetrySnapshot.recentTailSuccessesSinceProcessStart,
        failuresSinceProcessStart: telemetrySnapshot.recentTailFailuresSinceProcessStart,
      }),
      replay: Object.freeze({ daily: daily, rolling: rolling }),
      retention: Object.freeze({
        enabled: retentionEnabled,
        running: telemetrySnapshot.retentionRunning,
        lastAttemptAt: telemetrySnapshot.lastRetentionAttemptAt?.toISOString() ?? null,
        lastCompletedAt: telemetrySnapshot.lastRetentionCompletedAt?.toISOString() ?? null,
        lastOutcome: telemetrySnapshot.lastRetentionOutcome,
        lastSkipCategory: telemetrySnapshot.lastRetentionSkipCategory,
        nextScheduledExecutionAt: retentionEnabled ? nextAutomaticPositionHistoryRetentionExecutionAt(generatedAt).toISOString() : null,
        currentRetentionPolicyFloor: policyFloor.toISOString(),
        cursorsBehindRetentionFloor: floorAlignment.behind,
        cursorsAtOrBeyondRetentionFloor: floorAlignment.atOrBeyond,
        retentionFloorAligned: floorAlignment.aligned,
      }),
      meta: Object.freeze({
        telemetryScope: "process-local counters reset on API restart; cursor/replay/population are durable database truth",
        durableScope: "cursors, replay runs/checkpoints, and population runs are durable; request rate, failures, lock contention, blocked streams, recent-tail activity, and cycle timestamps are process-local",
        countersResetOnRestart: true,
      }),
    });
  }
  private async inspectReplay(client: any, kind: PositionHistoryReplayKind, safeBoundary: Date): Promise<PositionHistoryIngestionReplaySummary> {
    const expected = positionHistoryReplayTarget(kind, safeBoundary);
    const latest = (await (client.positionHistoryReplayRun.findFirst as (args: unknown) => Promise<null | {
      id: string;
      generationAnchor: Date;
      rangeFrom: Date;
      rangeTo: Date;
      status: PositionHistoryIngestionReplayState;
    }>)({
      where: { kind },
      orderBy: [{ generationAnchor: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    }));
    if (latest === null) {
      return Object.freeze({
        state: "NOT_CREATED" as const,
        generationAnchor: null,
        rangeFrom: null,
        rangeTo: null,
        checkpointsTotal: 0,
        checkpointsCompleted: 0,
        checkpointsRemaining: 0,
        progressPercent: null,
        isCurrent: false,
        debtSuspected: false,
        incompleteGenerations: 0,
        overdueIncompleteGenerations: 0,
        oldestIncompleteGenerationAnchor: null,
        oldestOverdueGenerationAnchor: null,
        hasReplayDebt: false,
        activeGenerationAnchor: null,
        activeState: null,
        activeCheckpointsTotal: 0,
        activeCheckpointsCompleted: 0,
        activeCheckpointsRemaining: 0,
        activeProgressPercent: null,
        activeIsOverdue: false,
        queuedIncompleteGenerations: 0,
        estimatedRemainingWindows: 0,
      });
    }
    const total = await client.positionHistoryReplayCheckpoint.count({ where: { runId: latest.id } });
    const remainingRaw = await client.positionHistoryReplayCheckpoint.count({
      where: { runId: latest.id, status: { not: PositionBackfillStatus.COMPLETED } },
    });
    const progress = replayProgress(total, remainingRaw);
    const state = latest.status;
    const isCurrent = latest.generationAnchor.getTime() === expected.generationAnchor.getTime();
    const completed = state === "COMPLETED" && progress.remaining === 0;
    const debtSuspected = !completed && latest.generationAnchor.getTime() < expected.generationAnchor.getTime();
    const incompleteRuns: readonly { id: string; generationAnchor: Date; status: PositionHistoryIngestionReplayState }[] = await client.positionHistoryReplayRun.findMany({
      where: { kind, status: { not: PositionHistoryReplayRunStatus.COMPLETED } },
      orderBy: [{ generationAnchor: "asc" }, { id: "asc" }],
      select: { id: true, generationAnchor: true, status: true },
    });
    const active = incompleteRuns[0] ?? null;
    const activeTotal = active === null ? 0 : await client.positionHistoryReplayCheckpoint.count({ where: { runId: active.id } });
    const incompleteCheckpoints: readonly { nextFrom: Date; rangeTo: Date }[] = active === null ? [] : await client.positionHistoryReplayCheckpoint.findMany({
      where: { runId: active.id, status: { not: PositionBackfillStatus.COMPLETED } },
      select: { nextFrom: true, rangeTo: true },
    });
    const activeProgress = replayProgress(activeTotal, incompleteCheckpoints.length);
    const overdueAnchors = incompleteRuns.map((run) => run.generationAnchor).filter((anchor) => anchor.getTime() < expected.generationAnchor.getTime());
    return Object.freeze({
      state,
      generationAnchor: latest.generationAnchor.toISOString(),
      rangeFrom: latest.rangeFrom.toISOString(),
      rangeTo: latest.rangeTo.toISOString(),
      checkpointsTotal: total,
      checkpointsCompleted: progress.completed,
      checkpointsRemaining: progress.remaining,
      progressPercent: progress.progressPercent,
      isCurrent,
      debtSuspected,
      incompleteGenerations: incompleteRuns.length,
      overdueIncompleteGenerations: overdueAnchors.length,
      oldestIncompleteGenerationAnchor: incompleteRuns.length === 0 ? null : incompleteRuns[0]!.generationAnchor.toISOString(),
      oldestOverdueGenerationAnchor: overdueAnchors.length === 0 ? null : overdueAnchors[0]!.toISOString(),
      hasReplayDebt: overdueAnchors.length > 0,
      activeGenerationAnchor: active?.generationAnchor.toISOString() ?? null,
      activeState: active?.status ?? null,
      activeCheckpointsTotal: activeTotal,
      activeCheckpointsCompleted: activeProgress.completed,
      activeCheckpointsRemaining: activeProgress.remaining,
      activeProgressPercent: activeProgress.progressPercent,
      activeIsOverdue: active !== null && active.generationAnchor.getTime() < expected.generationAnchor.getTime(),
      queuedIncompleteGenerations: Math.max(0, incompleteRuns.length - (active === null ? 0 : 1)),
      estimatedRemainingWindows: estimatedReplayRemainingWindows(incompleteCheckpoints),
    });
  }
}
