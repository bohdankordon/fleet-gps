import { translate } from "../../i18n/core";
import { DEFAULT_LOCALE, type AppLocale } from "../../i18n/locales";

export type AccountNavigationItem = Readonly<{ href: string; label: string }>;

const ACCOUNT_DESTINATIONS = Object.freeze([
  { href: "/account", labelKey: "account.navigation.overview" },
  { href: "/account/change-password", labelKey: "account.navigation.security" },
  { href: "/account/telegram", labelKey: "account.navigation.telegram" },
  { href: "/account/notifications", labelKey: "account.navigation.notifications" },
] as const);

export function accountNavigationFor(locale: AppLocale = DEFAULT_LOCALE): readonly AccountNavigationItem[] {
  return Object.freeze(ACCOUNT_DESTINATIONS.map((item) => Object.freeze({ href: item.href, label: translate(locale, item.labelKey) })));
}

export function activeAccountNavigationPath(pathname: string): string | undefined {
  if (pathname === "/account") return "/account";
  return ACCOUNT_DESTINATIONS.find((item) => item.href !== "/account" && (pathname === item.href || pathname.startsWith(`${item.href}/`)))?.href;
}
