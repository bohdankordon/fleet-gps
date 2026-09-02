import { z } from "zod";
import type { FleetMapResponse } from "./fleet-map-contract";
import { initialFleetMapSelectionState, selectFleetMapVehicle, type FleetMapSelectionState } from "./fleet-map-selection";

const vehicleIdSchema = z.string().uuid();

export type FleetMapDeepLinkResolution = Readonly<{
  selection: FleetMapSelectionState;
  requestedVehicleUnavailable: boolean;
}>;

export function fleetMapVehicleHref(vehicleId: string): string {
  const parsed = vehicleIdSchema.safeParse(vehicleId);
  if (!parsed.success) return "/map";
  return `/map?${new URLSearchParams({ vehicleId: parsed.data })}`;
}

export function parseFleetMapVehicleId(value: string | string[] | undefined): string | null {
  if (typeof value !== "string") return null;
  const parsed = vehicleIdSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function resolveFleetMapDeepLink(snapshot: FleetMapResponse, requestedVehicleId: string | null): FleetMapDeepLinkResolution {
  if (requestedVehicleId === null) return { selection: initialFleetMapSelectionState, requestedVehicleUnavailable: false };
  const selection = selectFleetMapVehicle(snapshot, initialFleetMapSelectionState, requestedVehicleId);
  return { selection, requestedVehicleUnavailable: selection.selectedVehicleId === null };
}
