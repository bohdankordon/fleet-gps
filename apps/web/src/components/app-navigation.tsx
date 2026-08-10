"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { APP_NAVIGATION, isActiveAppNavigationPath } from "@/lib/app-navigation";

export function AppNavigation() {
  const pathname = usePathname();
  return <nav className="app-nav" aria-label="Основная навигация"><div>{APP_NAVIGATION.map((item) => <Link href={item.href} aria-current={isActiveAppNavigationPath(item.href, pathname) ? "page" : undefined} key={item.href}>{item.label}</Link>)}</div></nav>;
}
