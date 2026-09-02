import { z } from "zod";

const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
const metric = z.number().finite().nonnegative();
const position = z.object({ latitude: z.number().finite().min(-90).max(90), longitude: z.number().finite().min(-180).max(180), observedAt: timestamp }).strict();
const speedingDetails = z.object({ zone: z.enum(["CITY", "OUTSIDE_CITY"]), confirmationSpeedKph: metric, lastSpeedKph: metric, peakSpeedKph: metric, thresholdKph: metric }).strict();
const inactivityDetails = z.object({ confirmationDistanceMeters: metric, lastDistanceMeters: metric, minimumDistanceMeters: metric, distanceThresholdMeters: metric, durationThresholdMinutes: z.number().int().positive() }).strict();
const recentEvent = z.discriminatedUnion("type", [
  z.object({ id: uuid, type: z.literal("SPEEDING"), status: z.enum(["OPEN", "RESOLVED"]), openedAt: timestamp, resolvedAt: timestamp.nullable(), notificationDeliveryStatus: z.enum(["NONE", "PENDING", "SENT", "FAILED"]), details: speedingDetails }).strict(),
  z.object({ id: uuid, type: z.literal("INACTIVITY"), status: z.enum(["OPEN", "RESOLVED"]), openedAt: timestamp, resolvedAt: timestamp.nullable(), notificationDeliveryStatus: z.enum(["NONE", "PENDING", "SENT", "FAILED"]), details: inactivityDetails }).strict(),
]);

export const vehicleDetailsResponseSchema = z.object({
  generatedAt: timestamp,
  vehicle: z.object({ id: uuid, name: z.string().min(1).max(255), disabled: z.boolean() }).strict(),
  connectivity: z.enum(["ONLINE", "OFFLINE", "UNKNOWN"]),
  currentState: z.object({ position, speedKph: metric.nullable(), freshness: z.enum(["FRESH", "STALE"]) }).strict().nullable(),
  today: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), distanceMeters: metric, movementDurationSeconds: z.number().int().nonnegative().nullable(), maxSpeedKph: metric.nullable(), source: z.enum(["RUNS", "MODE1", "HISTORICAL_POSITIONS"]), quality: z.enum(["EXACT", "PROVISIONAL", "ESTIMATED"]), isStale: z.boolean(), isDegraded: z.boolean() }).strict().nullable(),
  activeAlerts: z.array(z.object({ type: z.enum(["SPEEDING", "INACTIVITY"]), openedAt: timestamp }).strict()).max(2),
  recentEvents: z.array(recentEvent).max(10),
}).strict();

export type VehicleDetailsResponse = z.infer<typeof vehicleDetailsResponseSchema>;
export type VehicleDetailsEvent = z.infer<typeof recentEvent>;
export class VehicleDetailsContractError extends Error { public constructor() { super("Invalid vehicle-details response."); this.name = "VehicleDetailsContractError"; } }
export function parseVehicleDetailsResponse(value: unknown): VehicleDetailsResponse { const parsed = vehicleDetailsResponseSchema.safeParse(value); if (!parsed.success) throw new VehicleDetailsContractError(); return parsed.data; }
export function isVehicleDetailsId(value: string): boolean { return uuid.safeParse(value).success; }
