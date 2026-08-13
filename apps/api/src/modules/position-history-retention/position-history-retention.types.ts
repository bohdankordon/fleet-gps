export const POSITION_HISTORY_RETENTION_POLICY_DAYS = 90;
export const POSITION_HISTORY_RETENTION_ABSOLUTE_DAY_MS = 24 * 60 * 60 * 1_000;

export type PositionHistoryRetentionCheckpointClass = "FULLY_OBSOLETE" | "BOUNDARY_OVERLAP" | "PROTECTED";

export type PositionHistoryRetentionStatusCounts = Readonly<{
  pending: number;
  running: number;
  completed: number;
}>;

export type PositionHistoryRetentionFacts = Readonly<{
  observations: Readonly<{
    total: number;
    olderThanPolicyCutoff: number;
    atOrAfterPolicyCutoff: number;
    oldestObservedAt: Date | null;
    newestObservedAt: Date | null;
    vehiclesWithObservationsOlderThanCutoff: number;
    executableObservationCandidates: number;
  }>;
  checkpoints: Readonly<{
    total: number;
    fullyObsolete: number;
    boundaryOverlap: number;
    protected: number;
    fullyObsoleteByStatus: PositionHistoryRetentionStatusCounts;
    boundaryOverlapByStatus: PositionHistoryRetentionStatusCounts;
    protectedByStatus: PositionHistoryRetentionStatusCounts;
    endingExactlyAtCutoff: number;
    startingExactlyAtCutoff: number;
    strictlyCrossingCutoff: number;
  }>;
}>;

export interface PositionHistoryRetentionRepository {
  inspect(policyCutoff: Date): Promise<PositionHistoryRetentionFacts>;
  countActiveDurableRuns(): Promise<number>;
  deleteFullyObsoleteCheckpointBatch(policyCutoff: Date, limit: number): Promise<number>;
  countFullyObsoleteCheckpoints(policyCutoff: Date): Promise<number>;
  deleteExecutableObservationBatch(policyCutoff: Date, limit: number): Promise<number>;
  countExecutableObservationCandidates(policyCutoff: Date): Promise<number>;
}

export type PositionHistoryRetentionClock = Readonly<{ now(): Date }>;

export type PositionHistoryRetentionPlan = Readonly<{
  policyDays: number;
  canonicalAnchor: string;
  policyCutoff: string;
  observations: Readonly<{
    total: number;
    olderThanPolicyCutoff: number;
    atOrAfterPolicyCutoff: number;
    oldestObservedAt: string | null;
    newestObservedAt: string | null;
    vehiclesWithObservationsOlderThanCutoff: number;
    executableObservationCandidates: number;
  }>;
  checkpoints: Readonly<{
    total: number;
    fullyObsolete: number;
    boundaryOverlap: number;
    protected: number;
    fullyObsoleteByStatus: PositionHistoryRetentionStatusCounts;
    boundaryOverlapByStatus: PositionHistoryRetentionStatusCounts;
    protectedByStatus: PositionHistoryRetentionStatusCounts;
    endingExactlyAtCutoff: number;
    startingExactlyAtCutoff: number;
    strictlyCrossingCutoff: number;
  }>;
  safety: Readonly<{
    hasBoundaryOverlap: boolean;
    boundaryOverlapCheckpointCount: number;
    policyEligibleObservationCount: number;
    destructiveExecutionApproved: false;
  }>;
}>;

export const POSITION_HISTORY_RETENTION_CHECKPOINT_BUDGET = 5_000;
export const POSITION_HISTORY_RETENTION_OBSERVATION_BUDGET = 25_000;
export const POSITION_HISTORY_RETENTION_CHECKPOINT_BATCH_SIZE = 500;
export const POSITION_HISTORY_RETENTION_OBSERVATION_BATCH_SIZE = 1_000;

export type PositionHistoryRetentionExecutionRequest = Readonly<{
  expectedCanonicalAnchor: Date;
  expectedPolicyCutoff: Date;
}>;

export type PositionHistoryRetentionExecutionResult = Readonly<{
  canonicalAnchor: string;
  policyCutoff: string;
  deletedCheckpoints: number;
  deletedObservations: number;
  remainingFullyObsoleteCheckpoints: number;
  remainingExecutableObservationCandidates: number;
  stoppedByBudget: boolean;
  noWork: boolean;
}>;

export type PositionHistoryAutomaticRetentionOutcome = Readonly<{
  outcome: "DISABLED" | "NO_WORK" | "LOCK_UNAVAILABLE" | "ACTIVE_POPULATION" | "EXECUTED" | "FAILED_SAFE";
  result: PositionHistoryRetentionExecutionResult | null;
}>;

export type PositionHistoryRetentionExecutionErrorCode = "LOCK_UNAVAILABLE" | "ACTIVE_DURABLE_RUN" | "STALE_PLAN";

export class PositionHistoryRetentionExecutionError extends Error {
  public constructor(public readonly code: PositionHistoryRetentionExecutionErrorCode) {
    super(code);
    this.name = "PositionHistoryRetentionExecutionError";
  }
}
