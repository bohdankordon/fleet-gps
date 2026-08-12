import { z } from "zod";
import { parseVehicleTrackTimestamp } from "../vehicle-track/vehicle-track-range";

const count = z.number().int().nonnegative();
const timestamp = z.string().refine((value) => parseVehicleTrackTimestamp(value) !== null);
const nullableTimestamp = timestamp.nullable();
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

export const positionHistoryStatusSchema = z.object({
  policyDays: z.number().int().positive(),
  from: timestamp,
  to: timestamp,
  slices: z.object({ total: count, fullSevenDay: count, remainderHours: z.number().finite().positive().nullable() }).strict(),
  fleet: z.object({ total: count, providerEligible: count, providerDisabled: count }).strict(),
  backfill: z.object({ targetVehiclePairs: count, completedPairs: count, incompletePairs: count, providerEligibleIncompletePairs: count, estimatedRemainingHourlyWindows: count }).strict(),
  observations: z.object({ rowCount: count, vehiclesWithObservations: count, vehiclesWithoutObservations: count, firstObservationAt: nullableTimestamp, lastObservationAt: nullableTimestamp }).strict(),
  sliceStatuses: z.array(sliceStatus),
}).strict().superRefine((value, context) => {
  if (value.slices.total !== value.sliceStatuses.length) context.addIssue({ code: "custom", message: "slice count" });
  if (value.fleet.providerEligible + value.fleet.providerDisabled !== value.fleet.total) context.addIssue({ code: "custom", message: "fleet count" });
  if (value.backfill.completedPairs + value.backfill.incompletePairs !== value.backfill.targetVehiclePairs) context.addIssue({ code: "custom", message: "backfill count" });
  if (value.observations.vehiclesWithObservations + value.observations.vehiclesWithoutObservations !== value.fleet.total) context.addIssue({ code: "custom", message: "observation fleet count" });
  for (const slice of value.sliceStatuses) if (slice.completed + slice.running + slice.pending + slice.none !== slice.vehiclesTotal) context.addIssue({ code: "custom", message: "slice vehicle count" });
});

export type PositionHistoryStatusResponse = z.infer<typeof positionHistoryStatusSchema>;
export class PositionHistoryStatusContractError extends Error { public constructor() { super("Invalid position history status response"); this.name = "PositionHistoryStatusContractError"; } }
export function parsePositionHistoryStatus(value: unknown): PositionHistoryStatusResponse { const parsed = positionHistoryStatusSchema.safeParse(value); if (!parsed.success) throw new PositionHistoryStatusContractError(); return parsed.data; }
