import type { AlertEventType, DailyStatSource, DataQuality } from "../../generated/prisma/client";
import type { StoredAlertEventProjectionRow } from "../alert-events/alert-events-query.repository";
import type { FleetMapStoredCurrentState } from "../fleet-map/fleet-map-current-state.projection";

export type StoredVehicleDailyStat = Readonly<{
  distanceMeters: unknown;
  movementDurationSeconds: number | null;
  maxSpeedKph: unknown | null;
  source: DailyStatSource;
  quality: DataQuality;
  isStale: boolean;
  isDegraded: boolean;
}>;

export type StoredVehicleDetailsSnapshot = Readonly<{
  timezone: string;
  positionFreshnessSeconds: number;
  serviceDate: Date;
  vehicle: Readonly<{
    id: string;
    name: string;
    currentState: FleetMapStoredCurrentState | null;
    dailyStat: StoredVehicleDailyStat | null;
  }> | null;
  activeAlerts: readonly Readonly<{ type: AlertEventType; confirmedAt: Date }>[];
  activeAlertsExceededLimit: boolean;
  recentEvents: readonly StoredAlertEventProjectionRow[];
}>;

export interface VehicleDetailsQueryRepository {
  getSnapshot(vehicleId: string): Promise<StoredVehicleDetailsSnapshot>;
}
