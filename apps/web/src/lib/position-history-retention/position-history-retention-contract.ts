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
    total: count,
    olderThanPolicyCutoff: count,
    atOrAfterPolicyCutoff: count,
    oldestObservedAt: timestamp.nullable(),
    newestObservedAt: timestamp.nullable(),
    vehiclesWithObservationsOlderThanCutoff: count,
    executableObservationCandidates: count,
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
  safety: z.object({
    hasBoundaryOverlap: z.boolean(),
    boundaryOverlapCheckpointCount: count,
    policyEligibleObservationCount: count,
    destructiveExecutionApproved: z.literal(false),
  }).strict(),
}).strict().superRefine((value, context) => {
  if (value.observations.olderThanPolicyCutoff + value.observations.atOrAfterPolicyCutoff !== value.observations.total) context.addIssue({ code: "custom", message: "observation total" });
  if (value.checkpoints.fullyObsolete + value.checkpoints.boundaryOverlap + value.checkpoints.protected !== value.checkpoints.total) context.addIssue({ code: "custom", message: "checkpoint total" });
  if (value.checkpoints.endingExactlyAtCutoff + value.checkpoints.strictlyCrossingCutoff !== value.checkpoints.boundaryOverlap) context.addIssue({ code: "custom", message: "overlap total" });
  if (value.checkpoints.startingExactlyAtCutoff > value.checkpoints.protected) context.addIssue({ code: "custom", message: "protected equality" });
  if (value.safety.hasBoundaryOverlap !== (value.checkpoints.boundaryOverlap > 0)) context.addIssue({ code: "custom", message: "overlap safety" });
  if (value.safety.boundaryOverlapCheckpointCount !== value.checkpoints.boundaryOverlap) context.addIssue({ code: "custom", message: "overlap count" });
  if (value.safety.policyEligibleObservationCount !== value.observations.olderThanPolicyCutoff) context.addIssue({ code: "custom", message: "eligible count" });
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
  remainingFullyObsoleteCheckpoints: count,
  remainingExecutableObservationCandidates: count,
  stoppedByBudget: z.boolean(),
  noWork: z.boolean(),
}).strict().superRefine((value, context) => {
  if (value.completedReplayCheckpoints > value.advancedReplayCheckpoints) context.addIssue({ code: "custom", message: "completed replay checkpoints" });
  const noWork = value.advancedCursorFloors === 0
    && value.advancedReplayCheckpoints === 0
    && value.deletedCheckpoints === 0
    && value.deletedObservations === 0
    && value.remainingFullyObsoleteCheckpoints === 0
    && value.remainingExecutableObservationCandidates === 0;
  if (value.noWork !== noWork) context.addIssue({ code: "custom", message: "no work" });
});

export type PositionHistoryRetentionExecutionRequest = z.infer<typeof positionHistoryRetentionExecutionRequestSchema>;
export type PositionHistoryRetentionExecutionResult = z.infer<typeof positionHistoryRetentionExecutionResultSchema>;
