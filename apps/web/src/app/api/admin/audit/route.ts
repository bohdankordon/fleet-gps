import { forwardAuditRead } from "@/lib/audit/audit-bff";

export const dynamic = "force-dynamic";
export function GET(request: Request): Promise<Response> { return forwardAuditRead(request); }
