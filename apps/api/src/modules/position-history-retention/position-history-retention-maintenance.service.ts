import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import type { ApiConfig } from "../../config/api-config";
import { API_CONFIG } from "../../config/api-config.tokens";
import { PositionHistoryRetentionService } from "./position-history-retention.service";
import { PositionHistoryRetentionExecutionError, type PositionHistoryAutomaticRetentionOutcome } from "./position-history-retention.types";
import { PositionHistoryIngestionTelemetryService } from "../position-history-horizon-execution/position-history-ingestion-telemetry.service";

export const POSITION_HISTORY_RETENTION_CRON = "0 0 6 * * *";
export const POSITION_HISTORY_RETENTION_TIME_ZONE = "UTC";
export const POSITION_HISTORY_RETENTION_SCHEDULE_UTC_HOUR = 6;
export function nextAutomaticPositionHistoryRetentionExecutionAt(now: Date): Date {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error("Invalid retention schedule instant.");
  const candidate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), POSITION_HISTORY_RETENTION_SCHEDULE_UTC_HOUR));
  if (candidate.getTime() <= now.getTime()) candidate.setUTCDate(candidate.getUTCDate() + 1);
  return candidate;
}

@Injectable()
export class PositionHistoryRetentionMaintenanceService {
  private readonly logger = new Logger(PositionHistoryRetentionMaintenanceService.name);

  public constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly retention: PositionHistoryRetentionService,
    private readonly telemetry: PositionHistoryIngestionTelemetryService,
  ) {}

  @Cron(POSITION_HISTORY_RETENTION_CRON, { name: "taxi-gps:position-history-retention", timeZone: POSITION_HISTORY_RETENTION_TIME_ZONE })
  public async scheduledEvaluate(): Promise<PositionHistoryAutomaticRetentionOutcome> {
    const enabled = this.config.positionHistoryRetention?.enabled === true;
    if (enabled) this.telemetry?.startRetentionAttempt();
    try {
      const result = await this.evaluate();
      this.logResult(result);
      if (enabled) {
        if (result.outcome === "EXECUTED" || result.outcome === "NO_WORK") this.telemetry?.completeRetentionAttempt("SUCCESS");
        else if (result.outcome === "LOCK_UNAVAILABLE") this.telemetry?.completeRetentionAttempt("SKIPPED", "LOCK_UNAVAILABLE");
        else if (result.outcome === "ACTIVE_POPULATION") this.telemetry?.completeRetentionAttempt("SKIPPED", "ACTIVE_POPULATION");
      }
      return result;
    } catch {
      if (enabled) this.telemetry?.completeRetentionAttempt("FAILED");
      this.logger.error("Automatic position-history retention failed safely; no same-day retry will be scheduled.");
      return Object.freeze({ outcome: "FAILED_SAFE", result: null });
    }
  }

  public async evaluate(): Promise<PositionHistoryAutomaticRetentionOutcome> {
    if (this.config.positionHistoryRetention?.enabled !== true) return Object.freeze({ outcome: "DISABLED", result: null });

    const precheck = await this.retention.getRetentionPrecheck();
    if (precheck.cursorFloorCandidates === 0
      && precheck.replayCheckpointCandidates === 0
      && !precheck.hasFullyObsoleteCheckpoints
      && !precheck.hasExecutableObservationWork) {
      return Object.freeze({ outcome: "NO_WORK", result: null });
    }

    try {
      const result = await this.retention.executeAutomaticRetention();
      return Object.freeze({ outcome: result.noWork ? "NO_WORK" : "EXECUTED", result });
    } catch (error) {
      if (error instanceof PositionHistoryRetentionExecutionError && error.code === "LOCK_UNAVAILABLE") {
        return Object.freeze({ outcome: "LOCK_UNAVAILABLE", result: null });
      }
      if (error instanceof PositionHistoryRetentionExecutionError && error.code === "ACTIVE_DURABLE_RUN") {
        return Object.freeze({ outcome: "ACTIVE_POPULATION", result: null });
      }
      throw error;
    }
  }

  private logResult(result: PositionHistoryAutomaticRetentionOutcome): void {
    if (result.outcome === "EXECUTED" && result.result !== null) {
      this.logger.log(`Automatic position-history retention completed: cursorFloors=${result.result.advancedCursorFloors}, replayCheckpoints=${result.result.advancedReplayCheckpoints}, replayCompleted=${result.result.completedReplayCheckpoints}, checkpoints=${result.result.deletedCheckpoints}, observations=${result.result.deletedObservations}, stoppedByBudget=${result.result.stoppedByBudget}.`);
    } else if (result.outcome === "NO_WORK") this.logger.log("Automatic position-history retention found no work.");
    else if (result.outcome === "LOCK_UNAVAILABLE") this.logger.log("Automatic position-history retention skipped because the shared mutation lock is busy.");
    else if (result.outcome === "ACTIVE_POPULATION") this.logger.log("Automatic position-history retention skipped because a durable population run is active.");
  }
}
