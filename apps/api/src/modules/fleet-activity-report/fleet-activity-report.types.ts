import type { TripStopAnalyticsObservation, TripStopAnalyticsRange, TripStopAnalyticsPolicy } from "../trip-stop-analytics";
import type { VehicleScope } from "../vehicle-access/vehicle-access.types";

export const FLEET_ACTIVITY_REPORT_MAX_RANGE_MS = 25 * 60 * 60 * 1_000;

export type FleetActivityVehicle = Readonly<{ id: string; name: string }>;
export type FleetActivityStoredObservation = TripStopAnalyticsObservation & Readonly<{ vehicleId: string }>;
export type FleetActivitySnapshot = Readonly<{ vehicles: readonly FleetActivityVehicle[]; observations: readonly FleetActivityStoredObservation[] }>;
export interface FleetActivityReportRepository { getSnapshot(range: TripStopAnalyticsRange, scope: VehicleScope): Promise<FleetActivitySnapshot>; }

export type FleetActivityVehicleRow = Readonly<{
  vehicleId: string; vehicleName: string; hasGpsData: boolean; rawObservationCount: number;
  tripCount: number; observedDistanceMeters: number; tripDurationSeconds: number;
  stopCount: number; stopDurationSeconds: number; gapCount: number;
  firstObservationAt: Date | null; lastObservationAt: Date | null; gapDurationSeconds: number;
}>;

export type FleetActivityReport = Readonly<{
  from: Date; to: Date;
  generatedAt: Date; timezone: string; policy: TripStopAnalyticsPolicy;
  summary: Readonly<{ vehicleCount: number; vehiclesWithGps: number; vehicleWithoutGpsCount: number; tripCount: number; totalObservedDistanceMeters: number; totalTripDurationSeconds: number; gapCount: number; totalGapDurationSeconds: number }>;
  vehicles: readonly FleetActivityVehicleRow[];
}>;
