import type { DailyStatSource, DataQuality, VehicleStatus } from "../../generated/prisma/client";
import type { VehicleScope } from "../vehicle-access/vehicle-access.types";
import type { VehicleGroupRef } from "../vehicle-access/vehicle-access.types";

export type DashboardSettings = Readonly<{ timezone: string; minimumDailyDistanceMeters: number; positionFreshnessSeconds: number }>;
export type DashboardStoredVehicle = Readonly<{
  id: string; name: string; disabled: boolean; group: VehicleGroupRef | null; currentState: Readonly<{ status: VehicleStatus; externalLastUpdateAt: Date | null; fixTime: Date | null; speedKph: number | null; valid: boolean | null; outdated: boolean | null }> | null; dailyStat: Readonly<{ distanceMeters: unknown; source: DailyStatSource; quality: DataQuality; isStale: boolean; isDegraded: boolean }> | null;
}>;

export interface DashboardQueryRepository {
  getSettings(): Promise<DashboardSettings>;
  getVehiclesForServiceDate(serviceDate: string, scope: VehicleScope): Promise<readonly DashboardStoredVehicle[]>;
}
