import type { DailyStatSource, DataQuality, VehicleStatus } from "../../generated/prisma/client";

export type DashboardSettings = Readonly<{ timezone: string; minimumDailyDistanceMeters: number; positionFreshnessSeconds: number }>;
export type DashboardStoredVehicle = Readonly<{
  id: string; name: string; disabled: boolean; currentState: Readonly<{ status: VehicleStatus; externalLastUpdateAt: Date | null; fixTime: Date | null; speedKph: number | null; valid: boolean | null; outdated: boolean | null }> | null; dailyStat: Readonly<{ distanceMeters: unknown; source: DailyStatSource; quality: DataQuality; isStale: boolean; isDegraded: boolean }> | null;
}>;

export interface DashboardQueryRepository {
  getSettings(): Promise<DashboardSettings>;
  getVehiclesForServiceDate(serviceDate: string): Promise<readonly DashboardStoredVehicle[]>;
}
