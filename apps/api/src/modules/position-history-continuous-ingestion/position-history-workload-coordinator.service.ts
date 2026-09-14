import { Injectable, Logger } from "@nestjs/common";
import { PositionHistoryReplayKind } from "../../generated/prisma/client";
import type { PositionHistoryContinuousCycleResult } from "./position-history-continuous-ingestion.types";
import { PositionHistoryContinuousIngestionWorkerService } from "./position-history-continuous-ingestion-worker.service";
import { POSITION_HISTORY_CONTINUOUS_OPPORTUNITIES_PER_COORDINATED_CYCLE } from "./position-history-replay-orchestration.constants";
import type { PositionHistoryReplayQuantumResult } from "./position-history-replay-orchestration.types";
import { PositionHistoryReplayWorkerService } from "./position-history-replay-worker.service";

@Injectable()
export class PositionHistoryWorkloadCoordinatorService {
  private readonly logger = new Logger(PositionHistoryWorkloadCoordinatorService.name);

  public constructor(
    private readonly continuous: PositionHistoryContinuousIngestionWorkerService,
    private readonly replay: PositionHistoryReplayWorkerService,
  ) {}

  public async processCycle(): Promise<PositionHistoryContinuousCycleResult> {
    const continuous = await this.continuous.processCycle(POSITION_HISTORY_CONTINUOUS_OPPORTUNITIES_PER_COORDINATED_CYCLE);
    if (continuous.rateLimitResponses > 0 || continuous.lockUnavailable > 0) return continuous;
    const daily = await this.replay.processKind(PositionHistoryReplayKind.DAILY_7_DAY);
    this.log(daily);
    if (daily.rateLimitResponses > 0 || daily.outcome === "LOCK_UNAVAILABLE") return continuous;
    this.log(await this.replay.processKind(PositionHistoryReplayKind.ROLLING_90_DAY));
    return continuous;
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
