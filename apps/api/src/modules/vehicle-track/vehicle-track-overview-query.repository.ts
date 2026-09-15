import type { StoredVehicleTrackPoint } from "./vehicle-track-query.repository";
import type { VehicleScope } from "../vehicle-access/vehicle-access.types";
import type { VehicleGroupRef } from "../vehicle-access/vehicle-access.types";

export const MAX_OVERVIEW_POINTS = 2_000;
export const MAX_CONNECTED_RAW_GAP_SECONDS = 300;

export type StoredVehicleTrackOverviewPoint = StoredVehicleTrackPoint & Readonly<{
  segmentOrdinal: number;
  segmentRawPointCount: number;
  segmentFirstObservedAt: Date;
  segmentLastObservedAt: Date;
}>;

export type StoredVehicleTrackOverviewSnapshot = Readonly<{
  vehicle: Readonly<{ id: string; name: string; group: VehicleGroupRef | null }> | null;
  rawPointCount: number;
  segmentCount: number;
  qualityWarningCount: number;
  firstObservedAt: Date | null;
  lastObservedAt: Date | null;
  tooFragmented: boolean;
  points: readonly StoredVehicleTrackOverviewPoint[];
}>;

export interface VehicleTrackOverviewQueryRepository {
  getOverviewSnapshot(vehicleId: string, from: Date, to: Date, scope: VehicleScope): Promise<StoredVehicleTrackOverviewSnapshot>;
}
