export const APP_NAVIGATION = Object.freeze([{ href: "/", label: "Автопарк" }, { href: "/map", label: "Карта" }, { href: "/events", label: "События" }, { href: "/reports", label: "Отчёты" }, { href: "/admin/history", label: "Администрирование" }] as const);
import type { AuthPermission, AuthUser } from "./auth/auth-contract";
import { hasPermission } from "./auth/auth-contract";
const NAVIGATION_PERMISSIONS: Readonly<Record<(typeof APP_NAVIGATION)[number]["href"], AuthPermission>> = Object.freeze({ "/": "fleet.view", "/map": "map.view", "/events": "events.view", "/reports": "reports.view", "/admin/history": "historyAdmin.view" });
export function navigationFor(user: AuthUser | null): readonly (typeof APP_NAVIGATION)[number][] { return user ? APP_NAVIGATION.filter((item) => hasPermission(user, NAVIGATION_PERMISSIONS[item.href])) : []; }
export function isActiveAppNavigationPath(href: string, pathname: string): boolean { return href === "/" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`); }
