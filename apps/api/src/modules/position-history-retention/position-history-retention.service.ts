import { Inject, Injectable } from "@nestjs/common";
import { canonicalPositionHistoryMaintenanceAnchor } from "../position-history-population-runs/position-history-maintenance-anchor";
import { PositionHistoryHorizonAlreadyRunningError, PositionHistoryHorizonExecutionLockService } from "../position-history-horizon-execution/position-history-horizon-execution-lock.service";
import { POSITION_HISTORY_POLICY_DAYS } from "../position-history-horizon/position-history-horizon.policy";
import { positionHistoryPolicyFloor } from "../position-history-horizon/position-history-policy-floor";
import { AuditEventRepository, buildAutomaticRetentionExecutedAuditEvent, buildRetentionExecutedAuditEvent, type AuditUserActor, type RetentionExecutedAuditDetails } from "../audit";
import { POSITION_HISTORY_RETENTION_CLOCK, POSITION_HISTORY_RETENTION_REPOSITORY } from "./position-history-retention.tokens";
import { POSITION_HISTORY_RETENTION_CHECKPOINT_BATCH_SIZE, POSITION_HISTORY_RETENTION_CHECKPOINT_BUDGET, POSITION_HISTORY_RETENTION_OBSERVATION_BATCH_SIZE, POSITION_HISTORY_RETENTION_OBSERVATION_BUDGET, PositionHistoryRetentionExecutionError, type PositionHistoryPolicyReconciliationResult, type PositionHistoryRetentionClock, type PositionHistoryRetentionExecutionRequest, type PositionHistoryRetentionExecutionResult, type PositionHistoryRetentionPlan, type PositionHistoryRetentionPrecheck, type PositionHistoryRetentionRepository } from "./position-history-retention.types";

type RetentionAuditContext = Readonly<{ actorType: "USER"; actor: AuditUserActor }> | Readonly<{ actorType: "SYSTEM" }>;

@Injectable()
export class PositionHistoryRetentionService {
  public constructor(
    @Inject(POSITION_HISTORY_RETENTION_REPOSITORY) private readonly repository: PositionHistoryRetentionRepository,
    @Inject(POSITION_HISTORY_RETENTION_CLOCK) private readonly clock: PositionHistoryRetentionClock,
    private readonly mutationLock: PositionHistoryHorizonExecutionLockService,
    private readonly audit: AuditEventRepository,
  ) {}

  public async getRetentionPlan(now: Date = this.clock.now()): Promise<PositionHistoryRetentionPlan> {
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error("Invalid retention planning instant");
    const canonicalAnchor = canonicalPositionHistoryMaintenanceAnchor(now);
    const policyCutoff = positionHistoryPolicyFloor(now);
    const facts = await this.repository.inspect(policyCutoff);
    return Object.freeze({
      policyDays: POSITION_HISTORY_POLICY_DAYS,
      canonicalAnchor: canonicalAnchor.toISOString(),
      policyCutoff: policyCutoff.toISOString(),
      policyReconciliation: Object.freeze(facts.policyReconciliation),
      observations: Object.freeze({
        ...facts.observations,
        oldestObservedAt: facts.observations.oldestObservedAt?.toISOString() ?? null,
        newestObservedAt: facts.observations.newestObservedAt?.toISOString() ?? null,
      }),
      checkpoints: Object.freeze(facts.checkpoints),
    });
  }

  public async getRetentionPrecheck(now: Date = this.clock.now()): Promise<PositionHistoryRetentionPrecheck> {
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error("Invalid retention precheck instant");
    return this.repository.inspectPrecheck(positionHistoryPolicyFloor(now));
  }

  public async executeRetention(request: PositionHistoryRetentionExecutionRequest, actor?: AuditUserActor): Promise<PositionHistoryRetentionExecutionResult> {
    return this.executeLocked(request, actor === undefined ? undefined : { actorType: "USER", actor });
  }

  public async executeAutomaticRetention(): Promise<PositionHistoryRetentionExecutionResult> {
    return this.executeLocked(undefined, { actorType: "SYSTEM" });
  }

  private async executeLocked(request?: PositionHistoryRetentionExecutionRequest, auditContext?: RetentionAuditContext): Promise<PositionHistoryRetentionExecutionResult> {
    try {
      return await this.mutationLock.runExclusive(async () => {
        const now = this.clock.now();
        const canonicalAnchor = canonicalPositionHistoryMaintenanceAnchor(now);
        const policyCutoff = positionHistoryPolicyFloor(now);
        if (await this.repository.countActiveDurableRuns() > 0) throw new PositionHistoryRetentionExecutionError("ACTIVE_DURABLE_RUN");
        if (request !== undefined && (request.expectedCanonicalAnchor.getTime() !== canonicalAnchor.getTime()
          || request.expectedPolicyCutoff.getTime() !== policyCutoff.getTime())) {
          throw new PositionHistoryRetentionExecutionError("STALE_PLAN");
        }
        const policyReconciliation = await this.repository.reconcilePolicyFloor(policyCutoff);
        const result = await this.executeBoundedDestructivePass(canonicalAnchor, policyCutoff, policyReconciliation);
        if (auditContext !== undefined && result.deletedCheckpoints + result.deletedObservations > 0) {
          const details = retentionAuditDetails(result);
          await this.audit.appendWithDatabase(auditContext.actorType === "USER"
            ? buildRetentionExecutedAuditEvent(auditContext.actor, details)
            : buildAutomaticRetentionExecutedAuditEvent(details));
        }
        return result;
      });
    } catch (error) {
      if (error instanceof PositionHistoryHorizonAlreadyRunningError) throw new PositionHistoryRetentionExecutionError("LOCK_UNAVAILABLE");
      throw error;
    }
  }

  private async executeBoundedDestructivePass(canonicalAnchor: Date, policyCutoff: Date, policyReconciliation: PositionHistoryPolicyReconciliationResult): Promise<PositionHistoryRetentionExecutionResult> {
    let deletedCheckpoints = 0;
    let checkpointPhaseExhausted = false;
    while (deletedCheckpoints < POSITION_HISTORY_RETENTION_CHECKPOINT_BUDGET) {
      const limit = Math.min(POSITION_HISTORY_RETENTION_CHECKPOINT_BATCH_SIZE, POSITION_HISTORY_RETENTION_CHECKPOINT_BUDGET - deletedCheckpoints);
      const deleted = await this.repository.deleteFullyObsoleteCheckpointBatch(policyCutoff, limit);
      deletedCheckpoints += deleted;
      if (deleted < limit) {
        checkpointPhaseExhausted = true;
        break;
      }
    }

    if (!checkpointPhaseExhausted) {
      return this.result(canonicalAnchor, policyCutoff, policyReconciliation, deletedCheckpoints, 0, true, null, true);
    }

    let deletedObservations = 0;
    let observationPhaseExhausted = false;
    while (deletedObservations < POSITION_HISTORY_RETENTION_OBSERVATION_BUDGET) {
      const limit = Math.min(POSITION_HISTORY_RETENTION_OBSERVATION_BATCH_SIZE, POSITION_HISTORY_RETENTION_OBSERVATION_BUDGET - deletedObservations);
      const deleted = await this.repository.deleteExecutableObservationBatch(policyCutoff, limit);
      deletedObservations += deleted;
      if (deleted < limit) {
        observationPhaseExhausted = true;
        break;
      }
    }
    return this.result(canonicalAnchor, policyCutoff, policyReconciliation, deletedCheckpoints, deletedObservations, false, !observationPhaseExhausted, !observationPhaseExhausted);
  }

  private result(canonicalAnchor: Date, policyCutoff: Date, policyReconciliation: PositionHistoryPolicyReconciliationResult, deletedCheckpoints: number, deletedObservations: number, moreCheckpointWork: boolean, moreObservationWork: boolean | null, stoppedByBudget: boolean): PositionHistoryRetentionExecutionResult {
    return Object.freeze({
      canonicalAnchor: canonicalAnchor.toISOString(),
      policyCutoff: policyCutoff.toISOString(),
      ...policyReconciliation,
      deletedCheckpoints,
      deletedObservations,
      moreCheckpointWork,
      moreObservationWork,
      stoppedByBudget,
      noWork: policyReconciliation.advancedCursorFloors === 0 && policyReconciliation.advancedReplayCheckpoints === 0 && deletedCheckpoints === 0 && deletedObservations === 0,
    });
  }
}

export function retentionAuditDetails(result: PositionHistoryRetentionExecutionResult): RetentionExecutedAuditDetails {
  return Object.freeze({
    canonicalAnchor: result.canonicalAnchor,
    policyCutoff: result.policyCutoff,
    deletedCheckpoints: result.deletedCheckpoints,
    deletedObservations: result.deletedObservations,
    moreCheckpointWork: result.moreCheckpointWork,
    moreObservationWork: result.moreObservationWork,
    stoppedByBudget: result.stoppedByBudget,
  });
}
