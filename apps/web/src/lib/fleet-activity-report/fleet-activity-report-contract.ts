import { z } from "zod";
import { parseVehicleTrackTimestamp } from "../vehicle-track/vehicle-track-range";

const timestamp = z.string().refine((value) => parseVehicleTrackTimestamp(value) !== null);
const count = z.number().int().nonnegative();
const metric = z.number().finite().nonnegative();
const timezone = z.string().min(1).max(64).refine((value) => {
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
});
const policy = z.object({
  tripMovementSpeedKph: z.number().int().min(1).max(200),
  tripMovementConfirmationSeconds: z.number().int().min(1).max(604800),
  tripStopConfirmationSeconds: z.number().int().min(1).max(604800),
  tripDataGapSeconds: z.number().int().min(1).max(604800),
}).strict();
const row = z.object({
  vehicleId: z.string().uuid(), vehicleName: z.string().min(1).max(255),
  group: z.object({ id: z.string().uuid(), name: z.string().min(1).max(255) }).strict().nullable(),
  hasGpsData: z.boolean(), rawObservationCount: count,
  firstObservationAt: timestamp.nullable(), lastObservationAt: timestamp.nullable(),
  tripCount: count, observedDistanceMeters: metric, tripDurationSeconds: metric,
  stopCount: count, stopDurationSeconds: metric, gapCount: count, gapDurationSeconds: metric,
}).strict();

export const fleetActivityReportSchema = z.object({
  from: timestamp, to: timestamp, generatedAt: timestamp, timezone, policy,
  summary: z.object({
    vehicleCount: count, vehiclesWithGps: count, vehicleWithoutGpsCount: count, tripCount: count,
    totalObservedDistanceMeters: metric, totalTripDurationSeconds: metric, gapCount: count, totalGapDurationSeconds: metric,
  }).strict(),
  vehicles: z.array(row),
}).strict().superRefine((value, context) => {
  const issue = (message: string) => context.addIssue({ code: "custom", message });
  const from = Date.parse(value.from); const to = Date.parse(value.to);
  if (to < from || to - from > 25 * 3_600_000) issue("range");
  const gpsCount = value.vehicles.filter((vehicle) => vehicle.hasGpsData).length;
  if (value.summary.vehicleCount !== value.vehicles.length || value.summary.vehiclesWithGps !== gpsCount || value.summary.vehicleWithoutGpsCount !== value.vehicles.length - gpsCount) issue("vehicle counts");
  if (new Set(value.vehicles.map((vehicle) => vehicle.vehicleId)).size !== value.vehicles.length) issue("duplicate vehicle");
  for (const vehicle of value.vehicles) {
    if (vehicle.hasGpsData !== (vehicle.rawObservationCount > 0)) issue("GPS semantics");
    if (!vehicle.hasGpsData) {
      if (vehicle.firstObservationAt !== null || vehicle.lastObservationAt !== null || [vehicle.tripCount, vehicle.observedDistanceMeters, vehicle.tripDurationSeconds, vehicle.stopCount, vehicle.stopDurationSeconds, vehicle.gapCount, vehicle.gapDurationSeconds].some((metric) => metric !== 0)) issue("no GPS");
    } else {
      if (vehicle.firstObservationAt === null || vehicle.lastObservationAt === null) issue("missing observation boundaries");
      else {
        const first = Date.parse(vehicle.firstObservationAt); const last = Date.parse(vehicle.lastObservationAt);
        if (first < from || last >= to || first > last) issue("observation boundaries");
      }
    }
    if (vehicle.gapCount === 0 && vehicle.gapDurationSeconds !== 0) issue("gap duration");
  }
  const sums = {
    tripCount: value.vehicles.reduce((n, v) => n + v.tripCount, 0),
    totalObservedDistanceMeters: value.vehicles.reduce((n, v) => n + v.observedDistanceMeters, 0),
    totalTripDurationSeconds: value.vehicles.reduce((n, v) => n + v.tripDurationSeconds, 0),
    gapCount: value.vehicles.reduce((n, v) => n + v.gapCount, 0),
    totalGapDurationSeconds: value.vehicles.reduce((n, v) => n + v.gapDurationSeconds, 0),
  };
  for (const key of Object.keys(sums) as (keyof typeof sums)[]) {
    // Allow harmless floating-point summation differences, not rounded UI values.
    if (Math.abs(value.summary[key] - sums[key]) > 1e-8 * Math.max(1, sums[key])) issue("summary totals");
  }
});

export type FleetActivityReportResponse = z.infer<typeof fleetActivityReportSchema>;
export type FleetActivityVehicleRow = FleetActivityReportResponse["vehicles"][number];
export class FleetActivityReportContractError extends Error {
  public constructor() { super("Invalid fleet activity report response"); this.name = "FleetActivityReportContractError"; }
}
export function parseFleetActivityReport(value: unknown): FleetActivityReportResponse {
  const parsed = fleetActivityReportSchema.safeParse(value);
  if (!parsed.success) throw new FleetActivityReportContractError();
  return parsed.data;
}
