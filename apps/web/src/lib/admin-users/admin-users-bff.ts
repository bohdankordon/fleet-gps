import "server-only";
import { parseWebConfig } from "../web-config";
import { forwardAdminUsersToUpstream, type AdminUsersPath } from "./admin-users-bff-core";

export function forwardAdminUsers(request: Request, path: AdminUsersPath, allowedBodyKeys: readonly string[] | null): Promise<Response> {
  return forwardAdminUsersToUpstream(request, path, parseWebConfig(process.env).apiInternalBaseUrl, allowedBodyKeys);
}
