import { AUTH_COOKIE_NAME } from "./auth-contract";
import { rejectCrossOriginWrite } from "./same-origin";
import { boundedBodyStatus, readBoundedForm, readBoundedJson } from "../http/bounded-body";
import { parseAuthUser } from "./auth-contract";

export type AuthPath = "/api/auth/login" | "/api/auth/me" | "/api/auth/logout" | "/api/auth/change-password";

function expiredAuthCookie(production: boolean): string {
  return `${AUTH_COOKIE_NAME}=; Max-Age=0; HttpOnly; SameSite=Lax; Path=/${production ? "; Secure" : ""}`;
}

function unavailableLogoutResponse(production: boolean): Response {
  return Response.json({ statusCode: 503, error: "Service Unavailable" }, { status: 503, headers: { "Set-Cookie": expiredAuthCookie(production) } });
}

function safeAuthSetCookie(value: string | null, production: boolean): string | null {
  if (value === null || !value.startsWith(`${AUTH_COOKIE_NAME}=`)) return null;
  const attributes = value.split(";").slice(1).map((part) => part.trim().toLowerCase());
  if (!attributes.includes("httponly") || !attributes.includes("samesite=lax") || !attributes.includes("path=/")) return null;
  if (attributes.some((attribute) => attribute.startsWith("domain="))) return null;
  if (production && !attributes.includes("secure")) return null;
  return value;
}

export async function forwardAuthToUpstream(request: Request, path: AuthPath, apiInternalBaseUrl: string, bodyKeys: readonly string[] = [], fetcher: typeof fetch = fetch, production = process.env.NODE_ENV === "production"): Promise<Response> {
  if (request.method !== "GET") { const rejection = rejectCrossOriginWrite(request); if (rejection) return rejection; }
  const headers = new Headers({ Accept: "application/json" });
  const token = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${AUTH_COOKIE_NAME}=`))?.slice(AUTH_COOKIE_NAME.length + 1);
  if (token && path !== "/api/auth/login") headers.set("Cookie", `${AUTH_COOKIE_NAME}=${token}`);
  let body: string | undefined;
  if (bodyKeys.length > 0) {
    let input: unknown;
    try {
      const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
      if (contentType === "application/x-www-form-urlencoded") {
        const form = await readBoundedForm(request);
        input = Object.fromEntries(bodyKeys.map((key) => [key, form.get(key)]));
      } else if (contentType === "application/json") input = await readBoundedJson(request);
      else return Response.json({ statusCode: 400, error: "Bad Request" }, { status: 400 });
    } catch (error) { const status = boundedBodyStatus(error); return Response.json({ statusCode: status, error: status === 413 ? "Payload Too Large" : "Bad Request" }, { status }); }
    if (typeof input !== "object" || input === null) return Response.json({ statusCode: 400, error: "Bad Request" }, { status: 400 });
    const source = input as Record<string, unknown>;
    body = JSON.stringify(Object.fromEntries(bodyKeys.map((key) => [key, source[key]])));
    headers.set("Content-Type", "application/json");
  }
  try {
    const upstream = await fetcher(`${apiInternalBaseUrl}${path}`, { method: request.method, cache: "no-store", headers, ...(body === undefined ? {} : { body }) });
    const responseHeaders = new Headers({ "Content-Type": upstream.headers.get("content-type") ?? "application/json", "Cache-Control": "no-store" });
    if (path === "/api/auth/logout") responseHeaders.set("Set-Cookie", expiredAuthCookie(production));
    if (upstream.status === 429 && path === "/api/auth/login") return Response.json({ statusCode: 429, error: "LOGIN_RATE_LIMITED" }, { status: 429, headers: responseHeaders });
    if (upstream.status === 400 || upstream.status === 401 || upstream.status === 403) return Response.json({ statusCode: upstream.status, error: upstream.status === 400 ? "Bad Request" : upstream.status === 401 ? "Unauthorized" : "Forbidden" }, { status: upstream.status, headers: responseHeaders });
    if (!upstream.ok) return Response.json({ statusCode: 503, error: "Service Unavailable" }, { status: 503, headers: responseHeaders });
    let payload: unknown;
    try { payload = await upstream.json(); } catch { return Response.json({ statusCode: 502, error: "Bad Gateway" }, { status: 502, headers: responseHeaders }); }
    if (path === "/api/auth/logout") return typeof payload === "object" && payload !== null && (payload as { ok?: unknown }).ok === true
      ? Response.json({ ok: true }, { headers: responseHeaders })
      : Response.json({ statusCode: 502, error: "Bad Gateway" }, { status: 502, headers: responseHeaders });
    const user = parseAuthUser(payload);
    if (!user) return Response.json({ statusCode: 502, error: "Bad Gateway" }, { status: 502, headers: responseHeaders });
    if (path === "/api/auth/login" || path === "/api/auth/change-password") {
      const setCookie = safeAuthSetCookie(upstream.headers.get("set-cookie"), production);
      if (setCookie === null) return Response.json({ statusCode: 502, error: "Bad Gateway" }, { status: 502, headers: responseHeaders });
      responseHeaders.set("Set-Cookie", setCookie);
    }
    return Response.json(user, { headers: responseHeaders });
  } catch {
    return path === "/api/auth/logout" ? unavailableLogoutResponse(production) : Response.json({ statusCode: 503, error: "Service Unavailable" }, { status: 503 });
  }
}
