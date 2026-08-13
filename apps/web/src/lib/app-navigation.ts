export const APP_NAVIGATION = Object.freeze([{ href: "/", label: "Автопарк" }, { href: "/map", label: "Карта" }, { href: "/events", label: "События" }, { href: "/reports", label: "Отчёты" }] as const);
import type { AuthPermission, AuthUser } from "./auth/auth-contract";
import { hasPermission } from "./auth/auth-contract";
const NAVIGATION_PERMISSIONS: Readonly<Record<(typeof APP_NAVIGATION)[number]["href"], AuthPermission>> = Object.freeze({ "/": "fleet.view", "/map": "map.view", "/events": "events.view", "/reports": "reports.view" });
export type AppNavigationItem = Readonly<{ href: string; label: string }>;
export function navigationFor(user: AuthUser | null): readonly AppNavigationItem[] { if (!user) return []; const items: AppNavigationItem[] = APP_NAVIGATION.filter((item) => hasPermission(user, NAVIGATION_PERMISSIONS[item.href])); if (user.role === "ADMIN") items.push({ href: "/admin/users", label: "Администрирование" }); else if (hasPermission(user, "historyAdmin.view")) items.push({ href: "/admin/history", label: "Администрирование" }); return Object.freeze(items); }
export function isActiveAppNavigationPath(href: string, pathname: string): boolean { if (href === "/admin/users" && pathname.startsWith("/admin/")) return true; return href === "/" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`); }
