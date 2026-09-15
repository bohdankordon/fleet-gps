import { forwardVehicleGroups } from "@/lib/vehicle-groups/vehicle-groups-bff";
export const dynamic = "force-dynamic";
export function GET(request: Request): Promise<Response> { return forwardVehicleGroups(request, "/api/admin/vehicle-groups", null); }
export function POST(request: Request): Promise<Response> { return forwardVehicleGroups(request, "/api/admin/vehicle-groups", ["name"]); }
