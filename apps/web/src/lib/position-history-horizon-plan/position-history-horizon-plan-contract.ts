import { z } from "zod";
import { parseVehicleTrackTimestamp } from "../vehicle-track/vehicle-track-range";

const count = z.number().int().nonnegative();
const timestamp = z.string().refine((value) => parseVehicleTrackTimestamp(value) !== null);
const sliceStatus = z.object({
  from: timestamp,
  to: timestamp,
  durationHours: z.number().finite().positive(),
  vehiclesTotal: count,
  completed: count,
  running: count,
  pending: count,
  none: count,
  providerEligibleRemaining: count,
  estimatedRemainingHourlyWindows: count,
}).strict();

/**
 * Manual population planning read model. It describes the Stage 14B horizon and exact manual
 * backfill checkpoints only; it carries no stored-observation aggregate.
 */
export const positionHistoryHorizonPlanSchema = z.object({
  policyDays: z.number().int().positive(),
  from: timestamp,
  to: timestamp,
  slices: z.object({ total: count, fullSevenDay: count, remainderHours: z.number().finite().positive().nullable() }).strict(),
  fleet: z.object({ total: count, providerEligible: count, providerDisabled: count }).strict(),
  backfill: z.object({ targetVehiclePairs: count, completedPairs: count, incompletePairs: count, providerEligibleIncompletePairs: count, estimatedRemainingHourlyWindows: count }).strict(),
  sliceStatuses: z.array(sliceStatus),
}).strict().superRefine((value, context) => {
  if (value.slices.total !== value.sliceStatuses.length) context.addIssue({ code: "custom", message: "slice count" });
  if (value.slices.fullSevenDay > value.slices.total) context.addIssue({ code: "custom", message: "full slice count" });
  if (value.fleet.providerEligible + value.fleet.providerDisabled !== value.fleet.total) context.addIssue({ code: "custom", message: "fleet count" });
  if (value.backfill.completedPairs + value.backfill.incompletePairs !== value.backfill.targetVehiclePairs) context.addIssue({ code: "custom", message: "backfill count" });
  if (value.backfill.targetVehiclePairs > value.slices.total * value.fleet.total) context.addIssue({ code: "custom", message: "target pair count" });
  for (const slice of value.sliceStatuses) if (slice.completed + slice.running + slice.pending + slice.none !== slice.vehiclesTotal) context.addIssue({ code: "custom", message: "slice vehicle count" });
});

export type PositionHistoryHorizonPlanResponse = z.infer<typeof positionHistoryHorizonPlanSchema>;

export class PositionHistoryHorizonPlanContractError extends Error {
  public constructor() {
    super("Invalid position history horizon plan response");
    this.name = "PositionHistoryHorizonPlanContractError";
  }
}

export function parsePositionHistoryHorizonPlan(value: unknown): PositionHistoryHorizonPlanResponse {
  const parsed = positionHistoryHorizonPlanSchema.safeParse(value);
  if (!parsed.success) throw new PositionHistoryHorizonPlanContractError();
  return parsed.data;
}
