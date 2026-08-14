import { translate } from "../i18n/core";
import { DEFAULT_LOCALE, type AppLocale } from "../i18n/locales";
import type { AuthPermission, AuthUser } from "./auth/auth-contract";
import { hasPermission } from "./auth/auth-contract";
export const APP_NAVIGATION = Object.freeze([{ href: "/", key: "navigation.fleet" }, { href: "/map", key: "navigation.map" }, { href: "/events", key: "navigation.events" }, { href: "/reports", key: "navigation.reports" }] as const);
const NAVIGATION_PERMISSIONS: Readonly<Record<(typeof APP_NAVIGATION)[number]["href"], AuthPermission>> = Object.freeze({ "/": "fleet.view", "/map": "map.view", "/events": "events.view", "/reports": "reports.view" });
export type AppNavigationItem = Readonly<{ href: string; label: string }>;
export function navigationFor(user: AuthUser | null, locale: AppLocale = DEFAULT_LOCALE): readonly AppNavigationItem[] { if (!user) return []; const items: AppNavigationItem[] = APP_NAVIGATION.filter((item) => hasPermission(user, NAVIGATION_PERMISSIONS[item.href])).map((item) => ({ href: item.href, label: translate(locale, item.key) })); if (user.role === "ADMIN") items.push({ href: "/admin/users", label: translate(locale, "common.administration") }); else if (hasPermission(user, "historyAdmin.view")) items.push({ href: "/admin/history", label: translate(locale, "common.administration") }); return Object.freeze(items); }
export function isActiveAppNavigationPath(href: string, pathname: string): boolean { if (href === "/admin/users" && pathname.startsWith("/admin/")) return true; return href === "/" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`); }
