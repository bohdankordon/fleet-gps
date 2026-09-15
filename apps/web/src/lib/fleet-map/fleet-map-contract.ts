import { z } from "zod";

const isoTimestamp = z.string().datetime({ offset: true });
const count = z.number().int().nonnegative();
const latitude = z.number().finite().min(-90).max(90);
const longitude = z.number().finite().min(-180).max(180);
const speedKph = z.number().finite().nonnegative().nullable();

const vehicleSchema = z.strictObject({ id: z.string().uuid(), name: z.string(), group: z.strictObject({ id: z.string().uuid(), name: z.string() }).nullable() });
const positionSchema = z.strictObject({ latitude, longitude, observedAt: isoTimestamp });
const markerSchema = z.strictObject({ vehicle: vehicleSchema, position: positionSchema, speedKph, freshness: z.enum(["FRESH", "STALE"]) });

export const fleetMapResponseSchema = z.strictObject({
  generatedAt: isoTimestamp,
  positionFreshnessSeconds: z.number().int().positive(),
  summary: z.strictObject({ totalVehicles: count, withPosition: count, withoutPosition: count, invalidPosition: count, fresh: count, stale: count }),
  vehicles: z.array(markerSchema),
});

export type FleetMapResponse = z.infer<typeof fleetMapResponseSchema>;
export type FleetMapVehicle = FleetMapResponse["vehicles"][number];
export class FleetMapContractError extends Error { public constructor() { super("Invalid fleet map response."); this.name = "FleetMapContractError"; } }
export function parseFleetMapResponse(value: unknown): FleetMapResponse { const parsed = fleetMapResponseSchema.safeParse(value); if (!parsed.success) throw new FleetMapContractError(); return parsed.data; }
