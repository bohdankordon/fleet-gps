import { z } from "zod";
import { parseVehicleTrackTimestamp } from "../vehicle-track/vehicle-track-range";

export const positionHistoryPopulationRequestSchema = z.object({
  to: z.string().refine((value) => parseVehicleTrackTimestamp(value) !== null),
  maxWindows: z.union([z.literal(6), z.literal(12), z.literal(24)]),
  excludeProviderDisabled: z.boolean(),
}).strict();

const count = z.number().int().nonnegative();
export const positionHistoryPopulationResultSchema = z.object({
  to: z.string().refine((value) => parseVehicleTrackTimestamp(value) !== null),
  maxWindows: z.union([z.literal(6), z.literal(12), z.literal(24)]),
  excludeProviderDisabled: z.boolean(),
  committedWindows: count,
  providerRequests: count,
  rowsReceived: count,
  candidates: count,
  inserted: count,
  duplicates: count,
  invalid: count,
  retries: count,
  rateLimits: count,
  slicesTotal: count,
  slicesVisited: count,
  slicesAlreadyComplete: count,
  providerDisabledExcluded: count,
  stoppedByBudget: z.boolean(),
  horizonComplete: z.boolean(),
}).strict();

export type PositionHistoryPopulationRequest = z.infer<typeof positionHistoryPopulationRequestSchema>;
export type PositionHistoryPopulationResult = z.infer<typeof positionHistoryPopulationResultSchema>;
