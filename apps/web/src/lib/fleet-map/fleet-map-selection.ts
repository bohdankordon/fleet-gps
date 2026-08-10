import type { FleetMapResponse, FleetMapVehicle } from "./fleet-map-contract";

export function selectedFleetMapVehicle(snapshot: FleetMapResponse, vehicleId: string | null): FleetMapVehicle | null { return vehicleId === null ? null : snapshot.vehicles.find((vehicle) => vehicle.vehicle.id === vehicleId) ?? null; }
export function reconcileFleetMapSelection(snapshot: FleetMapResponse, selectedVehicleId: string | null): string | null { return selectedFleetMapVehicle(snapshot, selectedVehicleId)?.vehicle.id ?? null; }
