import "server-only";
import { authenticatedApiFetch } from "../auth/auth-cookie";
import { parseWebConfig } from "../web-config";
import { parseManagedVehicles, parseVehicleGroupDetail, parseVehicleGroupSummaries, type ManagedVehicle, type VehicleGroupDetail, type VehicleGroupSummary } from "./vehicle-groups-contract";

async function readJson(response: Response): Promise<unknown> {
  try { return await response.json(); } catch { return null; }
}

export async function fetchVehicleGroups(): Promise<readonly VehicleGroupSummary[]> {
  const response = await authenticatedApiFetch(`${parseWebConfig(process.env).apiInternalBaseUrl}/api/admin/vehicle-groups`, { cache: "no-store", headers: { Accept: "application/json" } });
  const groups = response.ok ? parseVehicleGroupSummaries(await readJson(response)) : null;
  if (!groups) throw new Error("Vehicle groups unavailable.");
  return groups;
}

export async function fetchVehicleGroup(groupId: string): Promise<VehicleGroupDetail | null> {
  const response = await authenticatedApiFetch(`${parseWebConfig(process.env).apiInternalBaseUrl}/api/admin/vehicle-groups/${encodeURIComponent(groupId)}`, { cache: "no-store", headers: { Accept: "application/json" } });
  if (response.status === 404) return null;
  const group = response.ok ? parseVehicleGroupDetail(await readJson(response)) : null;
  if (!group) throw new Error("Vehicle group unavailable.");
  return group;
}

export async function fetchManagedVehicles(): Promise<readonly ManagedVehicle[]> {
  const response = await authenticatedApiFetch(`${parseWebConfig(process.env).apiInternalBaseUrl}/api/admin/vehicle-groups/vehicles`, { cache: "no-store", headers: { Accept: "application/json" } });
  const vehicles = response.ok ? parseManagedVehicles(await readJson(response)) : null;
  if (!vehicles) throw new Error("Managed vehicles unavailable.");
  return vehicles;
}
