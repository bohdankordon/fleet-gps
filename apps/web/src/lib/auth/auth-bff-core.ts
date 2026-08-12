import { AUTH_COOKIE_NAME } from "./auth-contract";

export type AuthPath = "/api/auth/login" | "/api/auth/me" | "/api/auth/logout" | "/api/auth/change-password";

function expiredAuthCookie(production: boolean): string {
  return `${AUTH_COOKIE_NAME}=; Max-Age=0; HttpOnly; SameSite=Lax; Path=/${production ? "; Secure" : ""}`;
}

function unavailableLogoutResponse(production: boolean): Response {
  return Response.json({ statusCode: 503, error: "Service Unavailable" }, { status: 503, headers: { "Set-Cookie": expiredAuthCookie(production) } });
}

export async function forwardAuthToUpstream(request: Request, path: AuthPath, apiInternalBaseUrl: string, bodyKeys: readonly string[] = [], fetcher: typeof fetch = fetch, production = process.env.NODE_ENV === "production"): Promise<Response> {
  const headers = new Headers({ Accept: "application/json" });
  const token = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${AUTH_COOKIE_NAME}=`))?.slice(AUTH_COOKIE_NAME.length + 1);
  if (token && path !== "/api/auth/login") headers.set("Cookie", `${AUTH_COOKIE_NAME}=${token}`);
  let body: string | undefined;
  if (bodyKeys.length > 0) {
    let input: unknown;
    try {
      const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
      if (contentType === "application/x-www-form-urlencoded") {
        const form = await request.formData();
        input = Object.fromEntries(bodyKeys.map((key) => [key, form.get(key)]));
      } else if (contentType === "application/json") input = await request.json();
      else return Response.json({ statusCode: 400, error: "Bad Request" }, { status: 400 });
    } catch { return Response.json({ statusCode: 400, error: "Bad Request" }, { status: 400 }); }
    if (typeof input !== "object" || input === null) return Response.json({ statusCode: 400, error: "Bad Request" }, { status: 400 });
    const source = input as Record<string, unknown>;
    body = JSON.stringify(Object.fromEntries(bodyKeys.map((key) => [key, source[key]])));
    headers.set("Content-Type", "application/json");
  }
  try {
    const upstream = await fetcher(`${apiInternalBaseUrl}${path}`, { method: request.method, cache: "no-store", headers, ...(body === undefined ? {} : { body }) });
    const responseHeaders = new Headers({ "Content-Type": upstream.headers.get("content-type") ?? "application/json", "Cache-Control": "no-store" });
    if (path === "/api/auth/logout") responseHeaders.set("Set-Cookie", expiredAuthCookie(production));
    else { const setCookie = upstream.headers.get("set-cookie"); if (setCookie) responseHeaders.set("Set-Cookie", setCookie); }
    return new Response(await upstream.text(), { status: upstream.status, headers: responseHeaders });
  } catch {
    return path === "/api/auth/logout" ? unavailableLogoutResponse(production) : Response.json({ statusCode: 503, error: "Service Unavailable" }, { status: 503 });
  }
}
