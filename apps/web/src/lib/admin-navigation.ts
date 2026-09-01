import type { AuthUser } from "./auth/auth-contract";
import { hasPermission } from "./auth/auth-contract";
import { translate } from "../i18n/core";
import { DEFAULT_LOCALE, type AppLocale } from "../i18n/locales";

export type AdminNavigationItem = Readonly<{ href: string; label: string }>;
export function adminNavigationFor(user: AuthUser | null, locale: AppLocale = DEFAULT_LOCALE): readonly AdminNavigationItem[] {
  if (!user) return [];
  const items: AdminNavigationItem[] = [];
  if (user.role === "ADMIN") items.push({ href: "/admin/users", label: translate(locale, "navigation.users") }, { href: "/admin/settings", label: translate(locale, "navigation.settings") }, { href: "/admin/audit", label: translate(locale, "navigation.audit") });
  if (hasPermission(user, "historyAdmin.view")) items.push({ href: "/admin/history", label: translate(locale, "navigation.history") });
  return Object.freeze(items);
}

export function activeAdminNavigationPath(items: readonly AdminNavigationItem[], pathname: string): string | undefined {
  return items.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))?.href;
}
