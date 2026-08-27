import { forwardAdminSettings } from "@/lib/admin-settings/admin-settings-bff";
export function GET(request: Request): Promise<Response> { return forwardAdminSettings(request); }
export function PATCH(request: Request): Promise<Response> { return forwardAdminSettings(request); }
