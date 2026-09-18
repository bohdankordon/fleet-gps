import { rejectCrossOriginWrite } from "../auth/same-origin";
import { isAppLocale, LOCALE_COOKIE_MAX_AGE_SECONDS, LOCALE_COOKIE_NAME, type AppLocale } from "../../i18n/locales";
import { boundedBodyStatus, readBoundedJson } from "../http/bounded-body";

const noStore = { "Cache-Control": "no-store" };

function localeCookieAttributes(production: boolean): string {
  return `Path=/; HttpOnly; SameSite=Lax${production ? "; Secure" : ""}`;
}

export function localeCookie(value: AppLocale, production: boolean): string {
  return `${LOCALE_COOKIE_NAME}=${value}; Max-Age=${LOCALE_COOKIE_MAX_AGE_SECONDS}; ${localeCookieAttributes(production)}`;
}

export function expiredLocaleCookie(production: boolean): string {
  return `${LOCALE_COOKIE_NAME}=; Max-Age=0; ${localeCookieAttributes(production)}`;
}

export function createLocalePreferenceHandler(production = process.env.NODE_ENV === "production") {
  return async (request: Request): Promise<Response> => {
    const rejection = rejectCrossOriginWrite(request);
    if (rejection) return rejection;
    let body: unknown;
    try { body = await readBoundedJson(request); } catch (error) { const status = boundedBodyStatus(error); return Response.json({ statusCode: status, error: status === 413 ? "Payload Too Large" : "Bad Request" }, { status, headers: noStore }); }
    if (typeof body !== "object" || body === null || Array.isArray(body)) return Response.json({ statusCode: 400, error: "Bad Request" }, { status: 400, headers: noStore });
    const source = body as Record<string, unknown>;
    if (Object.keys(source).length !== 1 || !Object.hasOwn(source, "locale") || !isAppLocale(source.locale)) return Response.json({ statusCode: 400, error: "Bad Request" }, { status: 400, headers: noStore });
    return new Response(null, { status: 204, headers: { ...noStore, "Set-Cookie": localeCookie(source.locale, production) } });
  };
}

export function createLocalePreferenceDeleteHandler(production = process.env.NODE_ENV === "production") {
  return async (request: Request): Promise<Response> => {
    const rejection = rejectCrossOriginWrite(request);
    if (rejection) return rejection;
    return new Response(null, { status: 204, headers: { ...noStore, "Set-Cookie": expiredLocaleCookie(production) } });
  };
}
