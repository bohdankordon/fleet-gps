import "server-only";
import { parseWebConfig } from "../web-config";
import { forwardVehicleGroupsToUpstream, type VehicleGroupsPath } from "./vehicle-groups-bff-core";

export function forwardVehicleGroups(request: Request, path: VehicleGroupsPath, allowedBodyKeys: readonly string[] | null): Promise<Response> {
  return forwardVehicleGroupsToUpstream(request, path, parseWebConfig(process.env).apiInternalBaseUrl, allowedBodyKeys);
}
