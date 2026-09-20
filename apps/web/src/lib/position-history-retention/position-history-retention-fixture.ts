import type { PositionHistoryRetentionPlan } from "./position-history-retention-contract";

export function positionHistoryRetentionFixture(overlap = 2): PositionHistoryRetentionPlan {
  return {
    policyDays: 90,
    canonicalAnchor: "2026-08-11T02:00:00.000Z",
    policyCutoff: "2026-05-13T02:00:00.000Z",
    policyReconciliation: { cursorFloorCandidates: 2, replayCheckpointCandidates: 3 },
    observations: { oldestObservedAt: "2026-04-01T00:00:00.000Z", newestObservedAt: "2026-08-13T00:00:00.000Z", hasExecutableWork: true },
    checkpoints: {
      total: 8 + overlap,
      fullyObsolete: 3,
      boundaryOverlap: overlap,
      protected: 5,
      fullyObsoleteByStatus: { pending: 1, running: 1, completed: 1 },
      boundaryOverlapByStatus: { pending: overlap > 0 ? 1 : 0, running: 0, completed: overlap > 0 ? overlap - 1 : 0 },
      protectedByStatus: { pending: 1, running: 1, completed: 3 },
      endingExactlyAtCutoff: overlap > 0 ? 1 : 0,
      startingExactlyAtCutoff: 1,
      strictlyCrossingCutoff: overlap > 0 ? overlap - 1 : 0,
    },
  };
}
