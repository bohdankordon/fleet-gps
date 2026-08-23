"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isActiveAppNavigationPath, navigationFor } from "@/lib/app-navigation";
import { useI18n } from "../i18n/client";
import { useAuth } from "./auth-provider";
import { LanguageSelector } from "./language-selector";
import { LogoutButton } from "./logout-button";
import { FleetIcon } from "./ui/icons";

export function AppNavigation() {
  const pathname = usePathname();
  const user = useAuth();
  const { locale, t } = useI18n();
  if (pathname === "/login") return <header className="app-header app-header-login"><div className="app-header-inner"><div className="app-header-tools"><LanguageSelector /></div></div></header>;
  return <header className="app-header"><div className="app-header-inner">
    <span className="app-brand"><FleetIcon />Taxi GPS</span>
    <nav className="app-nav" aria-label={t("navigation.primaryLabel")} aria-describedby="navigation-scroll-hint"><span id="navigation-scroll-hint" className="sr-only">{t("navigation.scrollHint")}</span><div className="app-nav__list" tabIndex={0}>{navigationFor(user, locale).map((item) => <Link href={item.href} aria-current={isActiveAppNavigationPath(item.href, pathname) ? "page" : undefined} key={item.href}>{item.label}</Link>)}</div></nav>
    <div className="app-header-tools"><LanguageSelector />{user && <Link className="account-link" href="/account">{user.login}</Link>}{user && <LogoutButton size="compact" />}</div>
  </div></header>;
}
