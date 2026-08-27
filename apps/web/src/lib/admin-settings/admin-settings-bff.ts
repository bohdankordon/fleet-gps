import "server-only";
import { parseWebConfig } from "../web-config";
import { forwardAdminSettingsToUpstream } from "./admin-settings-bff-core";
export function forwardAdminSettings(request: Request): Promise<Response> { return forwardAdminSettingsToUpstream(request, parseWebConfig(process.env).apiInternalBaseUrl); }
