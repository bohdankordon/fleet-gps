import type { VehicleScope } from "../vehicle-access/vehicle-access.types";

export const MAX_TRACK_POINTS = 10_000;

export type StoredVehicleTrackPoint = Readonly<{
  observedAt: Date;
  latitude: number;
  longitude: number;
  speedKph: number | null;
  valid: boolean | null;
  outdated: boolean | null;
}>;

export type StoredVehicleTrackSnapshot = Readonly<{
  vehicle: Readonly<{ id: string; name: string }> | null;
  points: readonly StoredVehicleTrackPoint[];
}>;

export interface VehicleTrackQueryRepository {
  getSnapshot(vehicleId: string, from: Date, to: Date, scope: VehicleScope): Promise<StoredVehicleTrackSnapshot>;
}
