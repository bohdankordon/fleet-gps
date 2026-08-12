import type { TripStopAnalyticsObservation, TripStopAnalyticsRange } from "../trip-stop-analytics";

export type FleetActivityVehicle = Readonly<{ id: string; name: string }>;
export type FleetActivityStoredObservation = TripStopAnalyticsObservation & Readonly<{ vehicleId: string }>;
export type FleetActivitySnapshot = Readonly<{ vehicles: readonly FleetActivityVehicle[]; observations: readonly FleetActivityStoredObservation[] }>;
export interface FleetActivityReportRepository { getSnapshot(range: TripStopAnalyticsRange): Promise<FleetActivitySnapshot>; }

export type FleetActivityVehicleRow = Readonly<{
  vehicleId: string; vehicleName: string; hasGpsData: boolean; rawObservationCount: number;
  tripCount: number; observedDistanceMeters: number; tripDurationSeconds: number;
  stopCount: number; stopDurationSeconds: number; gapCount: number;
}>;

export type FleetActivityReport = Readonly<{
  from: Date; to: Date;
  summary: Readonly<{ vehicleCount: number; vehiclesWithGps: number; vehicleWithoutGpsCount: number; tripCount: number; totalObservedDistanceMeters: number; totalTripDurationSeconds: number; gapCount: number }>;
  vehicles: readonly FleetActivityVehicleRow[];
}>;
