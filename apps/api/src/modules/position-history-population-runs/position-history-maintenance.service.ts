import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import type { ApiConfig } from "../../config/api-config";
import { API_CONFIG } from "../../config/api-config.tokens";
import { PositionHistoryPopulationRunInitiatorType, PositionHistoryPopulationRunStatus } from "../../generated/prisma/client";
import { DatabaseService } from "../database/database.service";
import { PositionHistoryHorizonService } from "../position-history-horizon/position-history-horizon.service";
import { canonicalPositionHistoryMaintenanceAnchor } from "./position-history-maintenance-anchor";
import { PositionHistoryPopulationRunCreationService } from "./position-history-population-run-creation.service";
import { PositionHistoryPopulationRunConflictError } from "./position-history-population-run.errors";

export const POSITION_HISTORY_MAINTENANCE_CRON = "0 0 3 * * *";
export const POSITION_HISTORY_MAINTENANCE_TIME_ZONE = "UTC";
export const POSITION_HISTORY_MAINTENANCE_WINDOW_BUDGET = 5_000;

export type PositionHistoryMaintenanceEvaluationResult = Readonly<{
  outcome: "DISABLED" | "ACTIVE_RUN" | "NO_ELIGIBLE_WORK" | "CREATED" | "CREATION_RACE_LOST";
  eligibleRemainingWindows: number | null;
}>;

@Injectable()
export class PositionHistoryMaintenanceService {
  private readonly logger = new Logger(PositionHistoryMaintenanceService.name);

  public constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly database: DatabaseService,
    private readonly horizon: PositionHistoryHorizonService,
    private readonly creation: PositionHistoryPopulationRunCreationService,
  ) {}

  @Cron(POSITION_HISTORY_MAINTENANCE_CRON, { name: "taxi-gps:position-history-maintenance", timeZone: POSITION_HISTORY_MAINTENANCE_TIME_ZONE })
  public async scheduledEvaluate(): Promise<void> {
    try {
      const result = await this.evaluate(new Date());
      this.logResult(result);
    } catch {
      this.logger.error("Position-history maintenance evaluation failed safely.");
    }
  }

  public async evaluate(now: Date): Promise<PositionHistoryMaintenanceEvaluationResult> {
    if (!this.config.positionHistoryMaintenance.enabled) return Object.freeze({ outcome: "DISABLED", eligibleRemainingWindows: null });

    const active = await this.database.getClient().positionHistoryPopulationRun.findFirst({
      where: { status: { in: [PositionHistoryPopulationRunStatus.PENDING, PositionHistoryPopulationRunStatus.RUNNING] } },
      select: { id: true },
    });
    if (active !== null) return Object.freeze({ outcome: "ACTIVE_RUN", eligibleRemainingWindows: null });

    const anchor = canonicalPositionHistoryMaintenanceAnchor(now);
    const plan = await this.horizon.run(anchor);
    const eligibleRemainingWindows = plan.estimatedRemainingHourlyWindows;
    if (eligibleRemainingWindows === 0) return Object.freeze({ outcome: "NO_ELIGIBLE_WORK", eligibleRemainingWindows });

    try {
      await this.creation.createRun({
        initiatorType: PositionHistoryPopulationRunInitiatorType.SYSTEM,
        to: anchor,
        windowBudget: POSITION_HISTORY_MAINTENANCE_WINDOW_BUDGET,
        excludeProviderDisabled: true,
      });
      return Object.freeze({ outcome: "CREATED", eligibleRemainingWindows });
    } catch (error) {
      if (error instanceof PositionHistoryPopulationRunConflictError) return Object.freeze({ outcome: "CREATION_RACE_LOST", eligibleRemainingWindows });
      throw error;
    }
  }

  private logResult(result: PositionHistoryMaintenanceEvaluationResult): void {
    if (result.outcome === "CREATED") this.logger.log("Position-history maintenance created a SYSTEM durable run.");
    else if (result.outcome === "CREATION_RACE_LOST") this.logger.log("Position-history maintenance creation race was won by another instance.");
    else if (result.outcome === "ACTIVE_RUN") this.logger.log("Position-history maintenance skipped because a durable run is active.");
    else if (result.outcome === "NO_ELIGIBLE_WORK") this.logger.log("Position-history maintenance found no eligible work.");
  }
}
