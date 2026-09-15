import { forwardVehicleGroups } from "@/lib/vehicle-groups/vehicle-groups-bff";
export const dynamic = "force-dynamic";
export async function PUT(request: Request, { params }: Readonly<{ params: Promise<{ groupId: string }> }>): Promise<Response> { const { groupId } = await params; return forwardVehicleGroups(request, `/api/admin/vehicle-groups/${encodeURIComponent(groupId)}/vehicles`, ["vehicleIds"]); }
