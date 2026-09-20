import { z } from "zod";
import { parseVehicleTrackTimestamp } from "../vehicle-track/vehicle-track-range";

const count = z.number().int().nonnegative();
const timestamp = z.string().refine((value) => parseVehicleTrackTimestamp(value) !== null);
const statusCounts = z.object({ pending: count, running: count, completed: count }).strict();

export const positionHistoryRetentionPlanSchema = z.object({
  policyDays: z.number().int().positive(),
  canonicalAnchor: timestamp,
  policyCutoff: timestamp,
  policyReconciliation: z.object({
    cursorFloorCandidates: count,
    replayCheckpointCandidates: count,
  }).strict(),
  observations: z.object({
    oldestObservedAt: timestamp.nullable(),
    newestObservedAt: timestamp.nullable(),
    hasExecutableWork: z.boolean(),
  }).strict(),
  checkpoints: z.object({
    total: count,
    fullyObsolete: count,
    boundaryOverlap: count,
    protected: count,
    fullyObsoleteByStatus: statusCounts,
    boundaryOverlapByStatus: statusCounts,
    protectedByStatus: statusCounts,
    endingExactlyAtCutoff: count,
    startingExactlyAtCutoff: count,
    strictlyCrossingCutoff: count,
  }).strict(),
}).strict().superRefine((value, context) => {
  if (value.checkpoints.fullyObsolete + value.checkpoints.boundaryOverlap + value.checkpoints.protected !== value.checkpoints.total) context.addIssue({ code: "custom", message: "checkpoint total" });
  if (value.checkpoints.endingExactlyAtCutoff + value.checkpoints.strictlyCrossingCutoff !== value.checkpoints.boundaryOverlap) context.addIssue({ code: "custom", message: "overlap total" });
  if (value.checkpoints.startingExactlyAtCutoff > value.checkpoints.protected) context.addIssue({ code: "custom", message: "protected equality" });
  for (const [classification, statuses] of [
    [value.checkpoints.fullyObsolete, value.checkpoints.fullyObsoleteByStatus],
    [value.checkpoints.boundaryOverlap, value.checkpoints.boundaryOverlapByStatus],
    [value.checkpoints.protected, value.checkpoints.protectedByStatus],
  ] as const) if (statuses.pending + statuses.running + statuses.completed !== classification) context.addIssue({ code: "custom", message: "status count" });
});

export type PositionHistoryRetentionPlan = z.infer<typeof positionHistoryRetentionPlanSchema>;

export const positionHistoryRetentionExecutionRequestSchema = z.object({
  expectedCanonicalAnchor: timestamp,
  expectedPolicyCutoff: timestamp,
}).strict();

export const positionHistoryRetentionExecutionResultSchema = z.object({
  canonicalAnchor: timestamp,
  policyCutoff: timestamp,
  advancedCursorFloors: count,
  advancedReplayCheckpoints: count,
  completedReplayCheckpoints: count,
  deletedCheckpoints: count,
  deletedObservations: count,
  moreCheckpointWork: z.boolean(),
  moreObservationWork: z.boolean().nullable(),
  stoppedByBudget: z.boolean(),
  noWork: z.boolean(),
}).strict().superRefine((value, context) => {
  if (value.completedReplayCheckpoints > value.advancedReplayCheckpoints) context.addIssue({ code: "custom", message: "completed replay checkpoints" });
  const noWork = value.advancedCursorFloors === 0
    && value.advancedReplayCheckpoints === 0
    && value.deletedCheckpoints === 0
    && value.deletedObservations === 0;
  if (value.noWork !== noWork) context.addIssue({ code: "custom", message: "no work" });
});

export type PositionHistoryRetentionExecutionRequest = z.infer<typeof positionHistoryRetentionExecutionRequestSchema>;
export type PositionHistoryRetentionExecutionResult = z.infer<typeof positionHistoryRetentionExecutionResultSchema>;
