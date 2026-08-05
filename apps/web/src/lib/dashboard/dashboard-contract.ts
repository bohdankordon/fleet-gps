import { z } from "zod";

const isoTimestamp = z.string().datetime({ offset: true });
const finiteNonNegative = z.number().finite().nonnegative();
const count = z.number().int().nonnegative();
const vehicleSchema = z.object({
  id: z.string().min(1), name: z.string(), disabled: z.boolean(),
  status: z.enum(["online", "offline", "unknown"]),
  externalLastUpdateAt: isoTimestamp.nullable(), fixTime: isoTimestamp.nullable(),
  speedKph: finiteNonNegative.nullable(), positionValid: z.boolean().nullable(), positionOutdated: z.boolean().nullable(),
  positionFreshness: z.enum(["fresh", "stale", "missing", "future"]),
  dailyDistanceMeters: finiteNonNegative.nullable(),
  dailyDistanceSource: z.enum(["runs", "mode1", "historical_positions"]).nullable(),
  dailyDistanceQuality: z.enum(["exact", "provisional", "estimated"]).nullable(),
  dailyDistanceStale: z.boolean().nullable(), dailyDistanceDegraded: z.boolean().nullable(), belowMinimumDistance: z.boolean().nullable(),
});

export const dashboardVehiclesResponseSchema = z.object({
  serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), timezone: z.string().trim().min(1),
  minimumDailyDistanceMeters: finiteNonNegative, positionFreshnessSeconds: z.number().int().positive(),
  summary: z.object({ total: count, online: count, offline: count, unknown: count, freshPositions: count, stalePositions: count, withoutPosition: count, belowMinimumDistance: count, withoutDailyStat: count }),
  vehicles: z.array(vehicleSchema), generatedAt: isoTimestamp,
});
export type DashboardVehiclesResponse = z.infer<typeof dashboardVehiclesResponseSchema>;
export class DashboardContractError extends Error { public constructor() { super("Invalid dashboard response."); this.name = "DashboardContractError"; } }
export function parseDashboardVehiclesResponse(value: unknown): DashboardVehiclesResponse { const parsed = dashboardVehiclesResponseSchema.safeParse(value); if (!parsed.success) throw new DashboardContractError(); return parsed.data; }
