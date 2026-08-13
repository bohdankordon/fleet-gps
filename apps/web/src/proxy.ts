import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, hasPermission, parseAuthUser, type AuthPermission } from "@/lib/auth/auth-contract";
import { parseWebConfig } from "@/lib/web-config";

function requiredPermission(path: string): readonly AuthPermission[] | null {
  if (path === "/" || path.startsWith("/api/dashboard/") || path === "/api/system/sync-status") return ["fleet.view"];
  if (path === "/map" || path === "/api/fleet/map") return ["map.view"];
  if (path === "/events" || path === "/api/alert-events" || path === "/api/alert-events/summary") return ["events.view"];
  if (path === "/api/alert-events/map") return ["map.view", "events.view"];
  if (path === "/api/city-geofence/map") return ["map.view", "trips.view"];
  if (path === "/reports" || path === "/api/reports/fleet-activity") return ["reports.view"];
  if (path === "/admin/history" || path === "/api/system/position-history/horizon-status") return ["historyAdmin.view"];
  if (path === "/api/system/position-history/horizon-populate") return ["historyAdmin.populate"];
  if (/^\/vehicles\/[^/]+$/.test(path) || /^\/api\/vehicles\/[^/]+\/details$/.test(path)) return ["vehicles.view"];
  if (/^\/vehicles\/[^/]+\/(track|trips)$/.test(path) || /^\/api\/vehicles\/[^/]+\/(track|track\/overview|trip-analysis)$/.test(path)) return ["trips.view"];
  return null;
}

function requiresAdmin(path: string): boolean { return path === "/admin/users" || path.startsWith("/admin/users/") || path === "/api/admin/users" || path.startsWith("/api/admin/users/"); }

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const path = request.nextUrl.pathname;
  const required = requiredPermission(path);
  const adminOnly = requiresAdmin(path);
  if (!required && !adminOnly) return NextResponse.next();
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  let user = null;
  if (token) {
    try {
      const config = parseWebConfig(process.env);
      const response = await fetch(`${config.apiInternalBaseUrl}/api/auth/me`, { cache: "no-store", headers: { Accept: "application/json", Cookie: `${AUTH_COOKIE_NAME}=${token}` } });
      if (response.ok) user = parseAuthUser(await response.json());
    } catch {}
  }
  const api = path.startsWith("/api/");
  if (!user) return api ? NextResponse.json({ statusCode: 401, error: "Unauthorized" }, { status: 401 }) : NextResponse.redirect(new URL("/login", request.url));
  if (user.mustChangePassword) return api ? NextResponse.json({ statusCode: 403, error: "Forbidden" }, { status: 403 }) : NextResponse.redirect(new URL("/account/change-password", request.url));
  if (adminOnly && user.role !== "ADMIN") return api ? NextResponse.json({ statusCode: 403, error: "Forbidden" }, { status: 403 }) : NextResponse.redirect(new URL("/forbidden", request.url));
  if (required && !required.some((permission) => hasPermission(user!, permission))) return api ? NextResponse.json({ statusCode: 403, error: "Forbidden" }, { status: 403 }) : NextResponse.redirect(new URL("/forbidden", request.url));
  return NextResponse.next();
}

export const config = { matcher: ["/", "/map", "/events", "/reports", "/admin/:path*", "/vehicles/:path*", "/api/admin/:path*", "/api/dashboard/:path*", "/api/fleet/:path*", "/api/alert-events/:path*", "/api/city-geofence/:path*", "/api/reports/:path*", "/api/system/:path*", "/api/vehicles/:path*"] };
