export const MAX_FLEET_MAP_VEHICLES = 1_000;

export type FleetMapStoredVehicle = Readonly<{
  id: string;
  name: string;
  currentState: Readonly<{
    fixTime: Date | null;
    latitude: number | null;
    longitude: number | null;
    speedKph: number | null;
    valid: boolean | null;
    outdated: boolean | null;
  }> | null;
}>;

export type FleetMapStoredSnapshot = Readonly<{
  positionFreshnessSeconds: number;
  vehicles: readonly FleetMapStoredVehicle[];
}>;

export interface FleetMapQueryRepository {
  getSnapshot(): Promise<FleetMapStoredSnapshot>;
}
