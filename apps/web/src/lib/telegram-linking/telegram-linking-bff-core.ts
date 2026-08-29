import { rejectCrossOriginWrite } from "../auth/same-origin";
import { AUTH_COOKIE_NAME } from "../auth/auth-contract";

function sessionCookie(request: Request): string | null {
  return request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${AUTH_COOKIE_NAME}=`)) ?? null;
}

export async function forwardTelegramAccountToUpstream(request: Request, path: string, apiInternalBaseUrl: string, fetcher: typeof fetch = fetch): Promise<Response> {
  if (request.method !== "GET") { const rejected = rejectCrossOriginWrite(request); if (rejected) return rejected; }
  const headers = new Headers({ Accept: "application/json" }); const token = sessionCookie(request); if (token) headers.set("Cookie", token);
  try {
    const upstream = await fetcher(`${apiInternalBaseUrl}${path}`, { method: request.method, headers, cache: "no-store" });
    const responseHeaders = { "Content-Type": "application/json", "Cache-Control": "no-store" };
    if (upstream.status >= 500) return Response.json({ statusCode: upstream.status, error: "Internal Server Error" }, { status: upstream.status, headers: responseHeaders });
    return new Response(await upstream.text(), { status: upstream.status, headers: responseHeaders });
  } catch { return Response.json({ statusCode: 503, error: "Service Unavailable" }, { status: 503 }); }
}
