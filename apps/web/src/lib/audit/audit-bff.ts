import "server-only";
import { parseWebConfig } from "../web-config";
import { forwardAuditReadToUpstream } from "./audit-bff-core";

export function forwardAuditRead(request: Request): Promise<Response> { return forwardAuditReadToUpstream(request, parseWebConfig(process.env).apiInternalBaseUrl); }
