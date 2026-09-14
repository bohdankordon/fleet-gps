import { Injectable, Logger } from "@nestjs/common";
import { PositionHistoryReplayKind } from "../../generated/prisma/client";
import { PositionHistoryCapacityAllocator, type PositionHistoryCapacityLane } from "./position-history-capacity-planning";
import type { PositionHistoryContinuousCycleResult, PositionHistoryContinuousLane } from "./position-history-continuous-ingestion.types";
import { PositionHistoryContinuousIngestionWorkerService } from "./position-history-continuous-ingestion-worker.service";
import { POSITION_HISTORY_COORDINATED_REQUEST_START_BUDGET } from "./position-history-replay-orchestration.constants";
import type { PositionHistoryReplayQuantumResult } from "./position-history-replay-orchestration.types";
import { PositionHistoryReplayWorkerService } from "./position-history-replay-worker.service";

const empty = (): PositionHistoryContinuousCycleResult => Object.freeze({ vehicles: 0, requests: 0, providerRows: 0, inserted: 0, duplicates: 0, invalid: 0, retries: 0, rateLimitResponses: 0, cursorAdvancements: 0, recentTailCompleted: 0, backlogCompleted: 0, providerBlocked: 0, failedWork: 0, lockUnavailable: 0 });

function combine(left: PositionHistoryContinuousCycleResult, right: PositionHistoryContinuousCycleResult): PositionHistoryContinuousCycleResult {
  return Object.freeze({
    vehicles: Math.max(left.vehicles, right.vehicles), requests: left.requests + right.requests,
    providerRows: left.providerRows + right.providerRows, inserted: left.inserted + right.inserted,
    duplicates: left.duplicates + right.duplicates, invalid: left.invalid + right.invalid,
    retries: left.retries + right.retries, rateLimitResponses: left.rateLimitResponses + right.rateLimitResponses,
    cursorAdvancements: left.cursorAdvancements + right.cursorAdvancements,
    recentTailCompleted: left.recentTailCompleted + right.recentTailCompleted,
    backlogCompleted: left.backlogCompleted + right.backlogCompleted,
    providerBlocked: left.providerBlocked + right.providerBlocked,
    failedWork: left.failedWork + right.failedWork, lockUnavailable: left.lockUnavailable + right.lockUnavailable,
  });
}

function continuousLane(lane: PositionHistoryCapacityLane): PositionHistoryContinuousLane | null {
  if (lane === "RECENT_TAIL") return "RECENT_TAIL";
  if (lane === "CONTIGUOUS_BACKLOG") return "CONTIGUOUS_BACKLOG";
  return null;
}

@Injectable()
export class PositionHistoryWorkloadCoordinatorService {
  private readonly logger = new Logger(PositionHistoryWorkloadCoordinatorService.name);
  private readonly allocator = new PositionHistoryCapacityAllocator();

  public constructor(
    private readonly continuous: PositionHistoryContinuousIngestionWorkerService,
    private readonly replay: PositionHistoryReplayWorkerService,
  ) {}

  public async processCycle(): Promise<PositionHistoryContinuousCycleResult> {
    const [dailyPressure, rollingPressure] = await Promise.all([
      this.replay.inspectPressure(PositionHistoryReplayKind.DAILY_7_DAY),
      this.replay.inspectPressure(PositionHistoryReplayKind.ROLLING_90_DAY),
    ]);
    const plan = this.allocator.plan({ daily: dailyPressure, rolling: rollingPressure });
    const plannedContinuous = plan.map(continuousLane).filter((lane): lane is PositionHistoryContinuousLane => lane !== null);
    let result = empty();
    let requestStarts = 0;

    if (plannedContinuous.length > 0) {
      result = await this.continuous.processCycle(plannedContinuous.length, plannedContinuous);
      requestStarts += result.requests;
      if (result.rateLimitResponses > 0 || result.lockUnavailable > 0) return result;
    }

    for (const lane of plan) {
      if (requestStarts >= POSITION_HISTORY_COORDINATED_REQUEST_START_BUDGET) break;
      const kind = lane === "DAILY_7_DAY" ? PositionHistoryReplayKind.DAILY_7_DAY : lane === "ROLLING_90_DAY" ? PositionHistoryReplayKind.ROLLING_90_DAY : null;
      if (kind === null) continue;
      const replay = await this.replay.processKind(kind);
      requestStarts += replay.requests;
      this.log(replay);
      if (replay.rateLimitResponses > 0 || replay.outcome === "LOCK_UNAVAILABLE") return result;
    }

    const remaining = POSITION_HISTORY_COORDINATED_REQUEST_START_BUDGET - requestStarts;
    if (remaining > 0) {
      const fallback = await this.continuous.processCycle(remaining, Array.from({ length: remaining }, () => "CONTIGUOUS_BACKLOG" as const));
      result = combine(result, fallback);
    }
    return result;
  }

  private log(result: PositionHistoryReplayQuantumResult): void {
    this.logger.log("Recurring position-history replay quantum completed safely.", {
      kind: result.kind,
      generationAnchor: result.generationAnchor?.toISOString() ?? null,
      outcome: result.outcome,
      requests: result.requests,
      providerRows: result.providerRows,
      inserted: result.inserted,
      duplicates: result.duplicates,
      invalid: result.invalid,
      retries: result.retries,
      rateLimitResponses: result.rateLimitResponses,
      checkpointWindowsCompleted: result.checkpointWindowsCompleted,
      policyRetiredPrefixes: result.policyRetiredPrefixes,
      checkpointsRemaining: result.checkpointsRemaining,
    });
  }
}
