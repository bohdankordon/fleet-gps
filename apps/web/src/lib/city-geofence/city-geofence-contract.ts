import { z } from "zod";

const longitude = z.number().finite().min(-180).max(180);
const latitude = z.number().finite().min(-90).max(90);
const position = z.tuple([longitude, latitude]);
const linearRing = z.array(position).min(4).superRefine((ring, context) => {
  const first = ring[0];
  const last = ring.at(-1);
  if (first?.[0] !== last?.[0] || first?.[1] !== last?.[1]) {
    context.addIssue({ code: "custom", message: "GeoJSON linear rings must be closed." });
  }
});

export const cityGeofenceGeometrySchema = z.strictObject({
  type: z.literal("Polygon"),
  coordinates: z.array(linearRing).min(1),
});

export const cityGeofenceMapResponseSchema = z.strictObject({
  generatedAt: z.string().datetime({ offset: true }),
  configured: z.boolean(),
  geometry: cityGeofenceGeometrySchema.nullable(),
}).superRefine((response, context) => {
  if (response.configured !== (response.geometry !== null)) {
    context.addIssue({ code: "custom", message: "Configured state and geometry must agree." });
  }
});

export type CityGeofenceGeometry = z.infer<typeof cityGeofenceGeometrySchema>;
export type CityGeofenceMapResponse = z.infer<typeof cityGeofenceMapResponseSchema>;

export class CityGeofenceContractError extends Error {
  public constructor() {
    super("Invalid city geofence map response.");
    this.name = "CityGeofenceContractError";
  }
}

export function parseCityGeofenceMapResponse(value: unknown): CityGeofenceMapResponse {
  const parsed = cityGeofenceMapResponseSchema.safeParse(value);
  if (!parsed.success) throw new CityGeofenceContractError();
  return parsed.data;
}
