"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isActiveAppNavigationPath, navigationFor } from "@/lib/app-navigation";
import { useAuth } from "./auth-provider";

export function AppNavigation() {
  const pathname = usePathname();
  const user = useAuth();
  if (pathname === "/login") return null;
  return <nav className="app-nav" aria-label="Основная навигация"><div>{navigationFor(user).map((item) => <Link href={item.href} aria-current={isActiveAppNavigationPath(item.href, pathname) ? "page" : undefined} key={item.href}>{item.label}</Link>)}{user && <Link className="account-link" href="/account">{user.login}</Link>}</div></nav>;
}
