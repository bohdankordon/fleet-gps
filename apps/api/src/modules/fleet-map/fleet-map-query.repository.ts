import type { FleetMapStoredCurrentState } from "./fleet-map-current-state.projection";

export const MAX_FLEET_MAP_VEHICLES = 1_000;

export type FleetMapStoredVehicle = Readonly<{
  id: string;
  name: string;
  currentState: FleetMapStoredCurrentState | null;
}>;

export type FleetMapStoredSnapshot = Readonly<{
  positionFreshnessSeconds: number;
  vehicles: readonly FleetMapStoredVehicle[];
}>;

export interface FleetMapQueryRepository {
  getSnapshot(): Promise<FleetMapStoredSnapshot>;
}
