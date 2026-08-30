"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, User } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { useAuth } from "./auth-provider";
import { LanguageSelector } from "./language-selector";
import { LogoutButton } from "./logout-button";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { Button } from "./ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { SidebarTrigger } from "./ui/sidebar";

type Translator = ReturnType<typeof useI18n>["t"];

function titleFor(pathname: string, t: Translator) {
  if (pathname.startsWith("/map")) return t("navigation.map");
  if (pathname.startsWith("/events")) return t("navigation.events");
  if (pathname.startsWith("/reports")) return t("navigation.reports");
  if (pathname.startsWith("/admin")) return t("common.administration");
  if (pathname.startsWith("/account")) return t("navigation.account");
  return t("navigation.fleet");
}

export function Topbar() {
  const pathname = usePathname();
  const user = useAuth();
  const { t } = useI18n();
  if (!user) return <header className="app-topbar app-topbar--public"><LanguageSelector /></header>;
  return <header className="app-topbar">
    <div className="app-topbar__context"><SidebarTrigger className="size-11 md:size-7" aria-label={t("navigation.toggleSidebar")} /><span className="app-topbar__title">{titleFor(pathname, t)}</span></div>
    <div className="app-topbar__tools">
      <LanguageSelector />
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="size-11 md:size-7" aria-label={t("navigation.accountMenu")} />}>
          <Avatar size="sm"><AvatarFallback>{user.login.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel>{user.login}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<Link href="/account" />}><User size={16} strokeWidth={1.8} aria-hidden="true" />{t("navigation.account")}</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<LogoutButton className="w-full justify-start" />}><LogOut size={16} strokeWidth={1.8} aria-hidden="true" />{t("auth.logout.submit")}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </header>;
}
