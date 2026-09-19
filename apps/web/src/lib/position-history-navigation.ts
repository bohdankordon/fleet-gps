import type { AppLocale } from "../i18n/locales";
import { translate } from "../i18n/core";

export type PositionHistoryNavigationItem = Readonly<{ href: string; label: string }>;

function withAnchor(path: string, anchor: string | null): string {
  return anchor === null ? path : `${path}?${new URLSearchParams({ to: anchor })}`;
}

export function positionHistoryNavigationFor(anchor: string | null, isAdmin: boolean, locale: AppLocale): readonly PositionHistoryNavigationItem[] {
  const items: PositionHistoryNavigationItem[] = [
    { href: "/admin/history", label: translate(locale, "history.navigation.overview") },
    { href: withAnchor("/admin/history/population", anchor), label: translate(locale, "history.navigation.population") },
  ];
  if (isAdmin) items.push({ href: "/admin/history/retention", label: translate(locale, "history.navigation.retention") });
  return Object.freeze(items);
}

export function activePositionHistoryPath(pathname: string): string {
  if (pathname === "/admin/history/population") return "/admin/history/population";
  if (pathname === "/admin/history/retention") return "/admin/history/retention";
  return "/admin/history";
}
