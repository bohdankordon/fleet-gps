import type { AlertEventType, DailyStatSource, DataQuality, VehicleStatus } from "../../generated/prisma/client";
import type { VehicleScope } from "../vehicle-access/vehicle-access.types";
import type { VehicleGroupRef } from "../vehicle-access/vehicle-access.types";
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
    disabled: boolean;
    group: VehicleGroupRef | null;
    currentState: (FleetMapStoredCurrentState & Readonly<{ status: VehicleStatus }>) | null;
    dailyStat: StoredVehicleDailyStat | null;
  }> | null;
  activeAlerts: readonly Readonly<{ type: AlertEventType; confirmedAt: Date }>[];
  activeAlertsExceededLimit: boolean;
  recentEvents: readonly StoredAlertEventProjectionRow[];
}>;

export interface VehicleDetailsQueryRepository {
  getSnapshot(vehicleId: string, scope: VehicleScope): Promise<StoredVehicleDetailsSnapshot>;
}
