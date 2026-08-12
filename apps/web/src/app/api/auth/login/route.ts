import { forwardAuth } from "@/lib/auth/auth-bff";
export const dynamic = "force-dynamic";
export function POST(request: Request): Promise<Response> { return forwardAuth(request, "/api/auth/login", ["login", "password"]); }
