import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, hasPermission, type AuthPermission } from "./lib/auth/auth-contract";
import { classifyMeResponse, type AuthResolution } from "./lib/auth/auth-resolution";
import { escapeHtml, unavailableCopy } from "./lib/auth/auth-unavailable-copy";
import { LOCALE_COOKIE_NAME, resolveLocalePreference, type AppLocale } from "./i18n/locales";
import { parseWebConfig } from "./lib/web-config";

const ADMIN_ONLY_ROUTE_PREFIXES = [
  "/admin/users",
  "/admin/settings",
  "/admin/audit",
  "/admin/history/retention",
  "/api/admin/users",
  "/api/admin/settings",
  "/api/admin/audit",
  "/api/system/position-history/retention-execute",
] as const;

function requiredPermission(path: string): readonly AuthPermission[] | null {
  if (path === "/" || path.startsWith("/api/dashboard/") || path === "/api/system/sync-status") return ["fleet.view"];
  if (path === "/map" || path === "/api/fleet/map") return ["map.view"];
  if (path === "/events" || path === "/api/alert-events" || path === "/api/alert-events/summary" || path === "/api/alert-events/vehicles" || /^\/api\/alert-events\/[^/]+\/investigation$/.test(path)) return ["events.view"];
  if (path === "/api/alert-events/map") return ["map.view", "events.view"];
  if (path === "/api/city-geofence/map") return ["map.view", "trips.view"];
  if (path === "/reports" || path === "/api/reports/fleet-activity") return ["reports.view"];
  if (path === "/admin/history" || path === "/admin/history/population" || path === "/api/system/position-history/horizon-status" || path === "/api/system/position-history/population-runs/active" || path === "/api/system/position-history/population-runs/recent" || path === "/api/system/position-history/retention-plan") return ["historyAdmin.view"];
  if (path === "/api/system/position-history/horizon-populate") return ["historyAdmin.populate"];
  if (path === "/api/system/position-history/population-runs") return ["historyAdmin.populate"];
  if (/^\/vehicles\/[^/]+$/.test(path) || /^\/api\/vehicles\/[^/]+\/details$/.test(path)) return ["vehicles.view"];
  if (/^\/vehicles\/[^/]+\/(track|trips)$/.test(path) || /^\/api\/vehicles\/[^/]+\/(track|track\/overview|trip-analysis)$/.test(path)) return ["trips.view"];
  return null;
}

function requiresAdmin(path: string): boolean {
  return ADMIN_ONLY_ROUTE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

function isAuthenticatedOnlyRoute(path: string): boolean {
  return path === "/account" || path.startsWith("/account/") || path === "/forbidden";
}

function jsonServiceUnavailable(): NextResponse {
  return NextResponse.json({ statusCode: 503, error: "Service Unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
}

function pageServiceUnavailable(request: NextRequest, locale: AppLocale): NextResponse {
  const copy = unavailableCopy(locale);
  const retryUrl = escapeHtml(request.nextUrl.pathname + request.nextUrl.search);
  const html =
    "<!DOCTYPE html>" +
    `<html lang="${escapeHtml(locale)}">` +
    "<head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">" +
    `<title>Fleet GPS \u2014 ${escapeHtml(copy.title)}</title></head>` +
    `<body><main><p>Fleet GPS</p><h1>${escapeHtml(copy.title)}</h1><p>${escapeHtml(copy.body)}</p>` +
    `<p><a href="${retryUrl}">${escapeHtml(copy.action)}</a></p></main></body></html>`;
  return new NextResponse(html, {
    status: 503,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function resolveRequestAuth(request: NextRequest): Promise<AuthResolution> {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return Object.freeze({ kind: "unauthenticated" });
  let apiInternalBaseUrl: string;
  try {
    apiInternalBaseUrl = parseWebConfig(process.env).apiInternalBaseUrl;
  } catch {
    return Object.freeze({ kind: "unavailable" });
  }
  try {
    const response = await fetch(`${apiInternalBaseUrl}/api/auth/me`, { cache: "no-store", headers: { Accept: "application/json", Cookie: `${AUTH_COOKIE_NAME}=${token}` } });
    if (response.status !== 200) return classifyMeResponse(response.status, undefined);
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return Object.freeze({ kind: "unavailable" });
    }
    return classifyMeResponse(response.status, payload);
  } catch {
    return Object.freeze({ kind: "unavailable" });
  }
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const path = request.nextUrl.pathname;
  const required = requiredPermission(path);
  const adminOnly = requiresAdmin(path);
  const accountOnly = isAuthenticatedOnlyRoute(path);
  if (!required && !adminOnly && !accountOnly) return NextResponse.next();
  const resolution = await resolveRequestAuth(request);
  const api = path.startsWith("/api/");
  if (resolution.kind === "unauthenticated") return api ? NextResponse.json({ statusCode: 401, error: "Unauthorized" }, { status: 401 }) : NextResponse.redirect(new URL("/login", request.url));
  if (resolution.kind === "unavailable") {
    if (api) return jsonServiceUnavailable();
    return pageServiceUnavailable(request, resolveLocalePreference(request.cookies.get(LOCALE_COOKIE_NAME)?.value, request.headers.get("accept-language")).locale);
  }
  const user = resolution.user;
  if (!accountOnly && user.mustChangePassword) return api ? NextResponse.json({ statusCode: 403, error: "Forbidden" }, { status: 403 }) : NextResponse.redirect(new URL("/account/change-password", request.url));
  if (adminOnly && user.role !== "ADMIN") return api ? NextResponse.json({ statusCode: 403, error: "Forbidden" }, { status: 403 }) : NextResponse.redirect(new URL("/forbidden", request.url));
  if (required && !required.some((permission) => hasPermission(user, permission))) return api ? NextResponse.json({ statusCode: 403, error: "Forbidden" }, { status: 403 }) : NextResponse.redirect(new URL("/forbidden", request.url));
  return NextResponse.next();
}

export const config = { matcher: ["/", "/map", "/events", "/reports", "/account", "/account/:path*", "/forbidden", "/admin/:path*", "/vehicles/:path*", "/api/admin/:path*", "/api/dashboard/:path*", "/api/fleet/:path*", "/api/alert-events/:path*", "/api/city-geofence/:path*", "/api/reports/:path*", "/api/system/:path*", "/api/vehicles/:path*"] };
