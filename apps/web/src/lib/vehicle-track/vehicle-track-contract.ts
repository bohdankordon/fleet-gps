import { z } from "zod";
import { parseVehicleTrackTimestamp } from "./vehicle-track-range";

const uuid = z.string().uuid();
const timestamp = z.string().refine((value) => parseVehicleTrackTimestamp(value) !== null);
const metric = z.number().finite().nonnegative();
const point = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  observedAt: timestamp,
  speedKph: metric.nullable(),
  valid: z.boolean().nullable(),
  outdated: z.boolean().nullable(),
}).strict();

export const vehicleTrackResponseSchema = z.object({
  generatedAt: timestamp,
  vehicle: z.object({ id: uuid, name: z.string().min(1).max(255) }).strict(),
  range: z.object({ from: timestamp, to: timestamp }).strict(),
  summary: z.object({ pointCount: z.number().int().min(0).max(10_000), firstObservedAt: timestamp.nullable(), lastObservedAt: timestamp.nullable() }).strict(),
  points: z.array(point).max(10_000),
}).strict().superRefine((value, context) => {
  if (value.summary.pointCount !== value.points.length) context.addIssue({ code: "custom", message: "point count mismatch" });
  const first = value.points[0]?.observedAt ?? null; const last = value.points.at(-1)?.observedAt ?? null;
  if (value.summary.firstObservedAt !== first || value.summary.lastObservedAt !== last) context.addIssue({ code: "custom", message: "summary boundary mismatch" });
});

export type VehicleTrackResponse = z.infer<typeof vehicleTrackResponseSchema>;
export type VehicleTrackPoint = z.infer<typeof point>;
export class VehicleTrackContractError extends Error { public constructor() { super("Invalid vehicle-track response."); this.name = "VehicleTrackContractError"; } }
export function parseVehicleTrackResponse(value: unknown): VehicleTrackResponse { const parsed = vehicleTrackResponseSchema.safeParse(value); if (!parsed.success) throw new VehicleTrackContractError(); return parsed.data; }
export function isVehicleTrackId(value: string): boolean { return uuid.safeParse(value).success; }
