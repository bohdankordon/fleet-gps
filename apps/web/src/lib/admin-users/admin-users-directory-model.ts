import { permissionLabel, roleLabel } from "../../i18n/domain-labels";
import { translate } from "../../i18n/core";
import type { AppLocale } from "../../i18n/locales";
import type { AdminManagedUser } from "./admin-users-contract";

export type AdminUsersRoleFilter = "ALL" | "ADMIN" | "USER";
export type AdminUsersStateFilter = "ALL" | "ACTIVE" | "DISABLED" | "PASSWORD_CHANGE_REQUIRED";
export type AdminUsersQuery = Readonly<{ q: string; role: AdminUsersRoleFilter; state: AdminUsersStateFilter }>;

export const EMPTY_ADMIN_USERS_QUERY: AdminUsersQuery = Object.freeze({ q: "", role: "ALL", state: "ALL" });

type QuerySource = URLSearchParams | Readonly<Record<string, string | readonly string[] | undefined>>;

function value(source: QuerySource, key: string): string {
  if (source instanceof URLSearchParams) return source.get(key) ?? "";
  const candidate = source[key];
  return typeof candidate === "string" ? candidate : candidate?.[0] ?? "";
}

export function parseAdminUsersQuery(source: QuerySource): AdminUsersQuery {
  const role = value(source, "role");
  const state = value(source, "state");
  return Object.freeze({
    q: value(source, "q").trim().slice(0, 120),
    role: role === "ADMIN" || role === "USER" ? role : "ALL",
    state: state === "ACTIVE" || state === "DISABLED" || state === "PASSWORD_CHANGE_REQUIRED" ? state : "ALL",
  });
}

export function serializeAdminUsersQuery(query: AdminUsersQuery): string {
  const params = new URLSearchParams();
  if (query.q.trim()) params.set("q", query.q.trim());
  if (query.role !== "ALL") params.set("role", query.role);
  if (query.state !== "ALL") params.set("state", query.state);
  return params.toString();
}

export function adminUserAuthoritySummary(user: AdminManagedUser, locale: AppLocale): string {
  if (user.role === "ADMIN") return translate(locale, "admin.users.fullAuthority");
  return user.permissions.length === 0 ? translate(locale, "common.noAccess") : translate(locale, "admin.users.permissionsCount", { count: user.permissions.length });
}

export function filterAdminUsers(users: readonly AdminManagedUser[], query: AdminUsersQuery, locale: AppLocale): readonly AdminManagedUser[] {
  const needle = query.q.trim().toLocaleLowerCase(locale);
  return users.filter((user) => {
    if (query.role !== "ALL" && user.role !== query.role) return false;
    if (query.state === "ACTIVE" && user.disabled) return false;
    if (query.state === "DISABLED" && !user.disabled) return false;
    if (query.state === "PASSWORD_CHANGE_REQUIRED" && !user.mustChangePassword) return false;
    if (!needle) return true;
    return [user.login, roleLabel(user.role, locale), adminUserAuthoritySummary(user, locale), user.disabled ? translate(locale, "admin.user.disabled") : translate(locale, "admin.user.active"), user.mustChangePassword ? translate(locale, "admin.user.passwordChangeRequired") : "", user.telegramStatus === "CONNECTED" ? translate(locale, "admin.users.telegramConnected") : translate(locale, "admin.users.telegramNotConnected"), ...user.permissions.map((permission) => permissionLabel(permission, locale))].join(" ").toLocaleLowerCase(locale).includes(needle);
  });
}

export function hasAdminUsersQuery(query: AdminUsersQuery): boolean {
  return Boolean(query.q || query.role !== "ALL" || query.state !== "ALL");
}
