import { forwardAdminUsers } from "@/lib/admin-users/admin-users-bff";
export const dynamic = "force-dynamic";
export function GET(request: Request): Promise<Response> { return forwardAdminUsers(request, "/api/admin/users", null); }
export function POST(request: Request): Promise<Response> { return forwardAdminUsers(request, "/api/admin/users", ["login", "role", "permissions", "vehicleAccess"]); }
