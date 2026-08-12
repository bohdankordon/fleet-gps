export const AUTH_COOKIE_NAME = "taxi_session";
export const AUTH_PERMISSIONS = ["fleet.view", "map.view", "events.view", "vehicles.view", "trips.view", "reports.view", "historyAdmin.view", "historyAdmin.populate"] as const;
export type AuthPermission = (typeof AUTH_PERMISSIONS)[number];
export type AuthUser = Readonly<{ id: string; login: string; role: "ADMIN" | "USER"; permissions: readonly AuthPermission[]; mustChangePassword: boolean }>;

export function parseAuthUser(value: unknown): AuthUser | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.id !== "string" || typeof candidate.login !== "string" || (candidate.role !== "ADMIN" && candidate.role !== "USER") || typeof candidate.mustChangePassword !== "boolean" || !Array.isArray(candidate.permissions) || candidate.permissions.some((key) => !AUTH_PERMISSIONS.includes(key as AuthPermission))) return null;
  return Object.freeze({ id: candidate.id, login: candidate.login, role: candidate.role, permissions: Object.freeze(candidate.permissions as AuthPermission[]), mustChangePassword: candidate.mustChangePassword });
}
export function hasPermission(user: AuthUser, permission: AuthPermission): boolean { return user.role === "ADMIN" || user.permissions.includes(permission); }
export function landingFor(user: AuthUser): string {
  if (user.mustChangePassword) return "/account/change-password";
  if (user.role === "ADMIN" || user.permissions.includes("fleet.view")) return "/";
  if (user.permissions.includes("map.view")) return "/map";
  if (user.permissions.includes("events.view")) return "/events";
  if (user.permissions.includes("reports.view")) return "/reports";
  if (user.permissions.includes("historyAdmin.view")) return "/admin/history";
  return "/account/no-access";
}
