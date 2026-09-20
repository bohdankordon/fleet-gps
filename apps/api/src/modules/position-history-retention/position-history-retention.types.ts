export type PositionHistoryRetentionCheckpointClass = "FULLY_OBSOLETE" | "BOUNDARY_OVERLAP" | "PROTECTED";

export type PositionHistoryRetentionStatusCounts = Readonly<{
  pending: number;
  running: number;
  completed: number;
}>;

export type PositionHistoryRetentionFacts = Readonly<{
  policyReconciliation: Readonly<{
    cursorFloorCandidates: number;
    replayCheckpointCandidates: number;
  }>;
  observations: Readonly<{
    oldestObservedAt: Date | null;
    newestObservedAt: Date | null;
    hasExecutableWork: boolean;
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

export type PositionHistoryRetentionPrecheck = Readonly<{
  cursorFloorCandidates: number;
  replayCheckpointCandidates: number;
  hasFullyObsoleteCheckpoints: boolean;
  hasExecutableObservationWork: boolean;
}>;

export interface PositionHistoryRetentionRepository {
  inspect(policyCutoff: Date): Promise<PositionHistoryRetentionFacts>;
  inspectPrecheck(policyCutoff: Date): Promise<PositionHistoryRetentionPrecheck>;
  countActiveDurableRuns(): Promise<number>;
  reconcilePolicyFloor(policyCutoff: Date): Promise<PositionHistoryPolicyReconciliationResult>;
  deleteFullyObsoleteCheckpointBatch(policyCutoff: Date, limit: number): Promise<number>;
  deleteExecutableObservationBatch(policyCutoff: Date, limit: number): Promise<number>;
}

export type PositionHistoryRetentionClock = Readonly<{ now(): Date }>;

export type PositionHistoryRetentionPlan = Readonly<{
  policyDays: number;
  canonicalAnchor: string;
  policyCutoff: string;
  policyReconciliation: PositionHistoryRetentionFacts["policyReconciliation"];
  observations: Readonly<{
    oldestObservedAt: string | null;
    newestObservedAt: string | null;
    hasExecutableWork: boolean;
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
  advancedCursorFloors: number;
  advancedReplayCheckpoints: number;
  completedReplayCheckpoints: number;
  deletedCheckpoints: number;
  deletedObservations: number;
  moreCheckpointWork: boolean;
  moreObservationWork: boolean | null;
  stoppedByBudget: boolean;
  noWork: boolean;
}>;

export type PositionHistoryPolicyReconciliationResult = Readonly<{
  advancedCursorFloors: number;
  advancedReplayCheckpoints: number;
  completedReplayCheckpoints: number;
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
