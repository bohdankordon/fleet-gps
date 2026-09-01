import type { FleetMapResponse } from "./fleet-map-contract";

export type FleetMapSearchOption = Readonly<{ value: string; label: string }>;

/** Search is intentionally local: Map authorization and filtering remain server-owned. */
export function fleetMapSearchOptions(snapshot: FleetMapResponse, query: string): readonly FleetMapSearchOption[] {
  const normalized = query.trim().toLocaleLowerCase();
  return snapshot.vehicles
    .filter((vehicle) => normalized.length === 0 || vehicle.vehicle.name.toLocaleLowerCase().includes(normalized))
    .map((vehicle) => Object.freeze({ value: vehicle.vehicle.id, label: vehicle.vehicle.name }));
}
