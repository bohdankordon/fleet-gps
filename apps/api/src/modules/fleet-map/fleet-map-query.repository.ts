import type { FleetMapStoredCurrentState } from "./fleet-map-current-state.projection";
import type { VehicleScope } from "../vehicle-access/vehicle-access.types";
import type { VehicleGroupRef } from "../vehicle-access/vehicle-access.types";

export const MAX_FLEET_MAP_VEHICLES = 1_000;

export type FleetMapStoredVehicle = Readonly<{
  id: string;
  name: string;
  group: VehicleGroupRef | null;
  currentState: FleetMapStoredCurrentState | null;
}>;

export type FleetMapStoredSnapshot = Readonly<{
  positionFreshnessSeconds: number;
  vehicles: readonly FleetMapStoredVehicle[];
}>;

export interface FleetMapQueryRepository {
  getSnapshot(scope: VehicleScope): Promise<FleetMapStoredSnapshot>;
}
