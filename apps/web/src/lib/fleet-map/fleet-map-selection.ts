import type { FleetMapResponse, FleetMapVehicle } from "./fleet-map-contract";

export type FleetMapSelectionState = Readonly<{
  selectedVehicleId: string | null;
  hasSelectedVehicle: boolean;
}>;

export const initialFleetMapSelectionState: FleetMapSelectionState = Object.freeze({
  selectedVehicleId: null,
  hasSelectedVehicle: false,
});

export function selectedFleetMapVehicle(snapshot: FleetMapResponse, vehicleId: string | null): FleetMapVehicle | null { return vehicleId === null ? null : snapshot.vehicles.find((vehicle) => vehicle.vehicle.id === vehicleId) ?? null; }
export function reconcileFleetMapSelection(snapshot: FleetMapResponse, selectedVehicleId: string | null): string | null { return selectedFleetMapVehicle(snapshot, selectedVehicleId)?.vehicle.id ?? null; }

export function selectFleetMapVehicle(snapshot: FleetMapResponse, state: FleetMapSelectionState, vehicleId: string): FleetMapSelectionState {
  const selectedVehicleId = reconcileFleetMapSelection(snapshot, vehicleId);
  return selectedVehicleId === null ? state : Object.freeze({ selectedVehicleId, hasSelectedVehicle: true });
}

export function clearFleetMapSelection(state: FleetMapSelectionState): FleetMapSelectionState {
  return state.selectedVehicleId === null ? state : Object.freeze({ ...state, selectedVehicleId: null });
}
