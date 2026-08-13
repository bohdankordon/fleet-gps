import { AUTH_COOKIE_NAME } from "../auth/auth-contract";
import { AuditContractError, parseAuditReadResponse } from "./audit-contract";
import { AuditQueryError, parseAuditRequestQuery, serializeAuditRequestQuery } from "./audit-query";

const noStore = { "Cache-Control": "no-store" };
function safe(status: 400 | 401 | 403 | 502 | 503): Response { return Response.json({ statusCode: status, error: status === 400 ? "Bad Request" : status === 401 ? "Unauthorized" : status === 403 ? "Forbidden" : status === 502 ? "Bad Gateway" : "Service Unavailable" }, { status, headers: noStore }); }
function authCookie(request: Request): string | null { return request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${AUTH_COOKIE_NAME}=`))?.slice(AUTH_COOKIE_NAME.length + 1) ?? null; }

export async function forwardAuditReadToUpstream(request: Request, apiInternalBaseUrl: string, fetcher: typeof fetch = fetch): Promise<Response> {
  let query: ReturnType<typeof parseAuditRequestQuery>;
  try { query = parseAuditRequestQuery(new URL(request.url).searchParams); } catch (error) { if (error instanceof AuditQueryError) return safe(400); return safe(400); }
  const headers = new Headers({ Accept: "application/json" });
  const token = authCookie(request);
  if (token) headers.set("Cookie", `${AUTH_COOKIE_NAME}=${token}`);
  const suffix = serializeAuditRequestQuery(query);
  try {
    const upstream = await fetcher(`${apiInternalBaseUrl}/api/admin/audit${suffix ? `?${suffix}` : ""}`, { method: "GET", cache: "no-store", headers });
    if (upstream.status === 400 || upstream.status === 401 || upstream.status === 403) return safe(upstream.status);
    if (!upstream.ok) return safe(upstream.status === 502 ? 502 : 503);
    try { return Response.json(parseAuditReadResponse(await upstream.json()), { headers: noStore }); }
    catch (error) { if (error instanceof AuditContractError) return safe(502); return safe(502); }
  } catch { return safe(503); }
}
