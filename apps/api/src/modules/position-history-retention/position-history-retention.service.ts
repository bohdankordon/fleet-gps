import { Inject, Injectable } from "@nestjs/common";
import { canonicalPositionHistoryMaintenanceAnchor } from "../position-history-population-runs/position-history-maintenance-anchor";
import { POSITION_HISTORY_RETENTION_CLOCK, POSITION_HISTORY_RETENTION_REPOSITORY } from "./position-history-retention.tokens";
import { POSITION_HISTORY_RETENTION_ABSOLUTE_DAY_MS, POSITION_HISTORY_RETENTION_POLICY_DAYS, type PositionHistoryRetentionClock, type PositionHistoryRetentionPlan, type PositionHistoryRetentionRepository } from "./position-history-retention.types";

@Injectable()
export class PositionHistoryRetentionService {
  public constructor(
    @Inject(POSITION_HISTORY_RETENTION_REPOSITORY) private readonly repository: PositionHistoryRetentionRepository,
    @Inject(POSITION_HISTORY_RETENTION_CLOCK) private readonly clock: PositionHistoryRetentionClock,
  ) {}

  public async getRetentionPlan(now: Date = this.clock.now()): Promise<PositionHistoryRetentionPlan> {
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error("Invalid retention planning instant");
    const canonicalAnchor = canonicalPositionHistoryMaintenanceAnchor(now);
    const policyCutoff = new Date(canonicalAnchor.getTime() - POSITION_HISTORY_RETENTION_POLICY_DAYS * POSITION_HISTORY_RETENTION_ABSOLUTE_DAY_MS);
    const facts = await this.repository.inspect(policyCutoff);
    return Object.freeze({
      policyDays: POSITION_HISTORY_RETENTION_POLICY_DAYS,
      canonicalAnchor: canonicalAnchor.toISOString(),
      policyCutoff: policyCutoff.toISOString(),
      observations: Object.freeze({
        ...facts.observations,
        oldestObservedAt: facts.observations.oldestObservedAt?.toISOString() ?? null,
        newestObservedAt: facts.observations.newestObservedAt?.toISOString() ?? null,
      }),
      checkpoints: Object.freeze(facts.checkpoints),
      safety: Object.freeze({
        hasBoundaryOverlap: facts.checkpoints.boundaryOverlap > 0,
        boundaryOverlapCheckpointCount: facts.checkpoints.boundaryOverlap,
        policyEligibleObservationCount: facts.observations.olderThanPolicyCutoff,
        destructiveExecutionApproved: false,
      }),
    });
  }
}
