import { Inject, Injectable } from "@nestjs/common";
import { canonicalPositionHistoryMaintenanceAnchor } from "../position-history-population-runs/position-history-maintenance-anchor";
import { PositionHistoryHorizonAlreadyRunningError, PositionHistoryHorizonExecutionLockService } from "../position-history-horizon-execution/position-history-horizon-execution-lock.service";
import { POSITION_HISTORY_RETENTION_CLOCK, POSITION_HISTORY_RETENTION_REPOSITORY } from "./position-history-retention.tokens";
import { POSITION_HISTORY_RETENTION_ABSOLUTE_DAY_MS, POSITION_HISTORY_RETENTION_CHECKPOINT_BATCH_SIZE, POSITION_HISTORY_RETENTION_CHECKPOINT_BUDGET, POSITION_HISTORY_RETENTION_OBSERVATION_BATCH_SIZE, POSITION_HISTORY_RETENTION_OBSERVATION_BUDGET, POSITION_HISTORY_RETENTION_POLICY_DAYS, PositionHistoryRetentionExecutionError, type PositionHistoryRetentionClock, type PositionHistoryRetentionExecutionRequest, type PositionHistoryRetentionExecutionResult, type PositionHistoryRetentionPlan, type PositionHistoryRetentionRepository } from "./position-history-retention.types";

@Injectable()
export class PositionHistoryRetentionService {
  public constructor(
    @Inject(POSITION_HISTORY_RETENTION_REPOSITORY) private readonly repository: PositionHistoryRetentionRepository,
    @Inject(POSITION_HISTORY_RETENTION_CLOCK) private readonly clock: PositionHistoryRetentionClock,
    private readonly mutationLock: PositionHistoryHorizonExecutionLockService,
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

  public async executeRetention(request: PositionHistoryRetentionExecutionRequest): Promise<PositionHistoryRetentionExecutionResult> {
    return this.executeLocked((plan) => {
      if (request.expectedCanonicalAnchor.getTime() !== Date.parse(plan.canonicalAnchor)
        || request.expectedPolicyCutoff.getTime() !== Date.parse(plan.policyCutoff)) {
        throw new PositionHistoryRetentionExecutionError("STALE_PLAN");
      }
    });
  }

  public async executeAutomaticRetention(): Promise<PositionHistoryRetentionExecutionResult> {
    return this.executeLocked();
  }

  private async executeLocked(validatePlan?: (plan: PositionHistoryRetentionPlan) => void): Promise<PositionHistoryRetentionExecutionResult> {
    try {
      return await this.mutationLock.runExclusive(async () => {
        if (await this.repository.countActiveDurableRuns() > 0) throw new PositionHistoryRetentionExecutionError("ACTIVE_DURABLE_RUN");

        const plan = await this.getRetentionPlan(this.clock.now());
        validatePlan?.(plan);
        return this.executeBoundedDestructivePass(plan);
      });
    } catch (error) {
      if (error instanceof PositionHistoryHorizonAlreadyRunningError) throw new PositionHistoryRetentionExecutionError("LOCK_UNAVAILABLE");
      throw error;
    }
  }

  private async executeBoundedDestructivePass(plan: PositionHistoryRetentionPlan): Promise<PositionHistoryRetentionExecutionResult> {
    const policyCutoff = new Date(plan.policyCutoff);
    let deletedCheckpoints = 0;
    while (plan.checkpoints.fullyObsolete > 0 && deletedCheckpoints < POSITION_HISTORY_RETENTION_CHECKPOINT_BUDGET) {
      const limit = Math.min(POSITION_HISTORY_RETENTION_CHECKPOINT_BATCH_SIZE, POSITION_HISTORY_RETENTION_CHECKPOINT_BUDGET - deletedCheckpoints);
      const deleted = await this.repository.deleteFullyObsoleteCheckpointBatch(policyCutoff, limit);
      deletedCheckpoints += deleted;
      if (deleted < limit) break;
    }

    const remainingFullyObsoleteCheckpoints = await this.repository.countFullyObsoleteCheckpoints(policyCutoff);
    if (remainingFullyObsoleteCheckpoints > 0) {
      return this.result(plan, deletedCheckpoints, 0, remainingFullyObsoleteCheckpoints, await this.repository.countExecutableObservationCandidates(policyCutoff), true);
    }

    let deletedObservations = 0;
    while (plan.observations.executableObservationCandidates > 0 && deletedObservations < POSITION_HISTORY_RETENTION_OBSERVATION_BUDGET) {
      const limit = Math.min(POSITION_HISTORY_RETENTION_OBSERVATION_BATCH_SIZE, POSITION_HISTORY_RETENTION_OBSERVATION_BUDGET - deletedObservations);
      const deleted = await this.repository.deleteExecutableObservationBatch(policyCutoff, limit);
      deletedObservations += deleted;
      if (deleted < limit) break;
    }
    const remainingExecutableObservationCandidates = await this.repository.countExecutableObservationCandidates(policyCutoff);
    return this.result(plan, deletedCheckpoints, deletedObservations, 0, remainingExecutableObservationCandidates, remainingExecutableObservationCandidates > 0);
  }

  private result(plan: PositionHistoryRetentionPlan, deletedCheckpoints: number, deletedObservations: number, remainingFullyObsoleteCheckpoints: number, remainingExecutableObservationCandidates: number, stoppedByBudget: boolean): PositionHistoryRetentionExecutionResult {
    return Object.freeze({
      canonicalAnchor: plan.canonicalAnchor,
      policyCutoff: plan.policyCutoff,
      deletedCheckpoints,
      deletedObservations,
      remainingFullyObsoleteCheckpoints,
      remainingExecutableObservationCandidates,
      stoppedByBudget,
      noWork: deletedCheckpoints === 0 && deletedObservations === 0 && remainingFullyObsoleteCheckpoints === 0 && remainingExecutableObservationCandidates === 0,
    });
  }
}
