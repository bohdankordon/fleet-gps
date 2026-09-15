import { z } from "zod";

import { VEHICLE_GROUP_COLORS } from "../vehicle-groups/vehicle-groups-contract";

const vehicleGroupColor = z.enum(VEHICLE_GROUP_COLORS);
const isoTimestamp = z.string().datetime({ offset: true });
const metric = z.number().finite().nonnegative();
const count = z.number().int().nonnegative();

const speedingDetailsSchema = z.object({
  zone: z.enum(["CITY", "OUTSIDE_CITY"]),
  confirmationSpeedKph: metric,
  lastSpeedKph: metric,
  peakSpeedKph: metric,
  thresholdKph: metric,
}).strict();

const inactivityDetailsSchema = z.object({
  confirmationDistanceMeters: metric,
  lastDistanceMeters: metric,
  minimumDistanceMeters: metric,
  distanceThresholdMeters: metric,
  durationThresholdMinutes: z.number().int().positive(),
}).strict();

const commonAlertEventSchema = z.object({
  id: z.string().uuid(),
  vehicle: z.object({ id: z.string().uuid(), name: z.string(), group: z.object({ id: z.string().uuid(), name: z.string(), color: vehicleGroupColor }).strict().nullable() }).strict(),
  status: z.enum(["OPEN", "RESOLVED"]),
  openedAt: isoTimestamp,
  lastObservedAt: isoTimestamp,
  resolvedAt: isoTimestamp.nullable(),
  notificationDeliveryStatus: z.enum(["NONE", "PENDING", "SENT", "FAILED"]),
}).strict();

const alertEventSchema = z.discriminatedUnion("type", [
  commonAlertEventSchema.extend({ type: z.literal("SPEEDING"), details: speedingDetailsSchema }).strict(),
  commonAlertEventSchema.extend({ type: z.literal("INACTIVITY"), details: inactivityDetailsSchema }).strict(),
]);

export const alertEventsListResponseSchema = z.object({ items: z.array(alertEventSchema), nextCursor: z.string().min(1).max(512).nullable() }).strict();
export const alertEventsSummaryResponseSchema = z.object({ open: z.object({ total: count, speeding: count, inactivity: count }).strict() }).strict();
export type AlertEvent = z.infer<typeof alertEventSchema>;
export type AlertEventsListResponse = z.infer<typeof alertEventsListResponseSchema>;
export type AlertEventsSummaryResponse = z.infer<typeof alertEventsSummaryResponseSchema>;

export class AlertEventsContractError extends Error { public constructor() { super("Invalid alert-events response."); this.name = "AlertEventsContractError"; } }
export function parseAlertEventsListResponse(value: unknown): AlertEventsListResponse { const parsed = alertEventsListResponseSchema.safeParse(value); if (!parsed.success) throw new AlertEventsContractError(); return parsed.data; }
export function parseAlertEventsSummaryResponse(value: unknown): AlertEventsSummaryResponse { const parsed = alertEventsSummaryResponseSchema.safeParse(value); if (!parsed.success) throw new AlertEventsContractError(); return parsed.data; }

export const alertEventsVehicleOptionsSchema = z.array(z.object({ vehicleId: z.string().uuid(), vehicleName: z.string(), group: z.object({ id: z.string().uuid(), name: z.string(), color: vehicleGroupColor }).strict().nullable() }).strict());
export type AlertEventsVehicleOptions = z.infer<typeof alertEventsVehicleOptionsSchema>;
export function parseAlertEventsVehicleOptions(value: unknown): AlertEventsVehicleOptions { const parsed = alertEventsVehicleOptionsSchema.safeParse(value); if (!parsed.success) throw new AlertEventsContractError(); return parsed.data; }
