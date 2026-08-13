import { AUTH_COOKIE_NAME } from "../auth/auth-contract";
import { rejectCrossOriginWrite } from "../auth/same-origin";

export type AdminUsersPath = "/api/admin/users" | `/api/admin/users/${string}`;

function authCookie(request: Request): string | null {
  return request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${AUTH_COOKIE_NAME}=`))?.slice(AUTH_COOKIE_NAME.length + 1) ?? null;
}

async function strictBody(request: Request, allowedKeys: readonly string[] | null): Promise<string | Response | undefined> {
  if (allowedKeys === null) return undefined;
  const contentLength = request.headers.get("content-length");
  if ((contentLength === null || contentLength === "0") && !request.headers.get("content-type")) return undefined;
  try {
    const input = await request.json();
    if (typeof input !== "object" || input === null || Array.isArray(input)) throw new Error();
    const source = input as Record<string, unknown>;
    if (Object.keys(source).some((key) => !allowedKeys.includes(key))) throw new Error();
    return JSON.stringify(Object.fromEntries(allowedKeys.filter((key) => key in source).map((key) => [key, source[key]])));
  } catch { return Response.json({ statusCode: 400, error: "Bad Request", message: "Проверьте отправленные данные." }, { status: 400, headers: { "Cache-Control": "no-store" } }); }
}

export async function forwardAdminUsersToUpstream(request: Request, path: AdminUsersPath, apiInternalBaseUrl: string, allowedBodyKeys: readonly string[] | null, fetcher: typeof fetch = fetch): Promise<Response> {
  if (request.method !== "GET") { const rejection = rejectCrossOriginWrite(request); if (rejection) return rejection; }
  const parsedBody = await strictBody(request, allowedBodyKeys);
  if (parsedBody instanceof Response) return parsedBody;
  const headers = new Headers({ Accept: "application/json" });
  const token = authCookie(request); if (token) headers.set("Cookie", `${AUTH_COOKIE_NAME}=${token}`);
  if (parsedBody !== undefined) headers.set("Content-Type", "application/json");
  try {
    const upstream = await fetcher(`${apiInternalBaseUrl}${path}`, { method: request.method, cache: "no-store", headers, ...(parsedBody === undefined ? {} : { body: parsedBody }) });
    const responseHeaders = new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store" });
    if (upstream.status >= 500) return Response.json({ statusCode: upstream.status, error: "Internal Server Error" }, { status: upstream.status, headers: responseHeaders });
    return new Response(await upstream.text(), { status: upstream.status, headers: responseHeaders });
  } catch { return Response.json({ statusCode: 503, error: "Service Unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
