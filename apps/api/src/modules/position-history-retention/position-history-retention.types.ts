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
