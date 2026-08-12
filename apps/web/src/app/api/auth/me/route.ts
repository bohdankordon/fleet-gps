import { forwardAuth } from "@/lib/auth/auth-bff";
export const dynamic = "force-dynamic";
export function GET(request: Request): Promise<Response> { return forwardAuth(request, "/api/auth/me"); }
