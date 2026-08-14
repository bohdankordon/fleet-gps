import { rejectCrossOriginWrite } from "../auth/same-origin";
import { isAppLocale, LOCALE_COOKIE_MAX_AGE_SECONDS, LOCALE_COOKIE_NAME } from "../../i18n/locales";

const noStore = { "Cache-Control": "no-store" };

export function localeCookie(value: string, production: boolean): string {
  return `${LOCALE_COOKIE_NAME}=${value}; Max-Age=${LOCALE_COOKIE_MAX_AGE_SECONDS}; Path=/; HttpOnly; SameSite=Lax${production ? "; Secure" : ""}`;
}

export function createLocalePreferenceHandler(production = process.env.NODE_ENV === "production") {
  return async (request: Request): Promise<Response> => {
    const rejection = rejectCrossOriginWrite(request);
    if (rejection) return rejection;
    let body: unknown;
    try { body = await request.json(); } catch { return Response.json({ statusCode: 400, error: "Bad Request" }, { status: 400, headers: noStore }); }
    if (typeof body !== "object" || body === null || Array.isArray(body)) return Response.json({ statusCode: 400, error: "Bad Request" }, { status: 400, headers: noStore });
    const source = body as Record<string, unknown>;
    if (Object.keys(source).length !== 1 || !Object.hasOwn(source, "locale") || !isAppLocale(source.locale)) return Response.json({ statusCode: 400, error: "Bad Request" }, { status: 400, headers: noStore });
    return new Response(null, { status: 204, headers: { ...noStore, "Set-Cookie": localeCookie(source.locale, production) } });
  };
}
