export type DashboardPositionFreshness = "fresh" | "stale" | "missing" | "future";
export type DashboardVehicleStatus = "online" | "offline" | "unknown";
export type DashboardDailyStatSource = "runs" | "mode1" | "historical_positions";
export type DashboardDataQuality = "exact" | "provisional" | "estimated";

export type DashboardVehicleReadModel = Readonly<{
  id: string; name: string; disabled: boolean; status: DashboardVehicleStatus; externalLastUpdateAt: string | null; fixTime: string | null; speedKph: number | null; positionValid: boolean | null; positionOutdated: boolean | null; positionFreshness: DashboardPositionFreshness; dailyDistanceMeters: number | null; dailyDistanceSource: DashboardDailyStatSource | null; dailyDistanceQuality: DashboardDataQuality | null; dailyDistanceStale: boolean | null; dailyDistanceDegraded: boolean | null; belowMinimumDistance: boolean | null;
}>;

export type DashboardSummary = Readonly<{ total: number; online: number; offline: number; unknown: number; freshPositions: number; stalePositions: number; withoutPosition: number; belowMinimumDistance: number; withoutDailyStat: number }>;
export type DashboardVehiclesResponse = Readonly<{ serviceDate: string; timezone: string; minimumDailyDistanceMeters: number; positionFreshnessSeconds: number; summary: DashboardSummary; vehicles: readonly DashboardVehicleReadModel[]; generatedAt: string }>;
