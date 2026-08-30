"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, CarFront, ChartColumn, Map, Settings, ShieldCheck, TriangleAlert, User, UserRound, Users, type LucideIcon } from "lucide-react";
import { useI18n } from "@/i18n/client";
import { adminNavigationFor } from "@/lib/admin-navigation";
import { isActiveAppNavigationPath, navigationFor } from "@/lib/app-navigation";
import { useAuth } from "./auth-provider";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarRail, useSidebar } from "./ui/sidebar";

const ICONS: Record<string, LucideIcon> = {
  "/": CarFront,
  "/map": Map,
  "/events": TriangleAlert,
  "/reports": ChartColumn,
  "/admin/users": Users,
  "/admin/settings": Settings,
  "/admin/audit": ShieldCheck,
  "/admin/history": Bell,
  "/account": User,
};

function MenuLinks({ items }: Readonly<{ items: readonly { href: string; label: string }[] }>) {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();
  return <SidebarMenu>{items.map((item) => {
    const Icon = ICONS[item.href] ?? CarFront;
    const active = isActiveAppNavigationPath(item.href, pathname);
    return <SidebarMenuItem key={item.href}>
      <SidebarMenuButton render={<Link href={item.href} aria-current={active ? "page" : undefined} onClick={() => { if (isMobile) setOpenMobile(false); }} />} isActive={active} tooltip={item.label}>
        <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
        <span>{item.label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>;
  })}</SidebarMenu>;
}

export function AppSidebar() {
  const user = useAuth();
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();
  const { locale, t } = useI18n();
  if (!user) return null;
  const primary = navigationFor(user, locale).filter((item) => !item.href.startsWith("/admin/"));
  const administration = adminNavigationFor(user, locale);
  const initials = user.login.slice(0, 2).toUpperCase();
  return <Sidebar collapsible="icon">
    <SidebarHeader className="border-b border-sidebar-border px-2 py-3">
      <Link href="/" className="flex h-8 items-center gap-2 overflow-hidden rounded-md px-2 text-sm font-semibold text-sidebar-foreground no-underline">
        <span className="grid size-5 shrink-0 place-items-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground"><CarFront size={14} strokeWidth={2} aria-hidden="true" /></span>
        <span className="truncate group-data-[collapsible=icon]:hidden">Taxi GPS</span>
      </Link>
    </SidebarHeader>
    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupLabel>{t("navigation.primaryWork")}</SidebarGroupLabel>
        <SidebarGroupContent><MenuLinks items={primary} /></SidebarGroupContent>
      </SidebarGroup>
      {administration.length > 0 ? <SidebarGroup>
        <SidebarGroupLabel>{t("navigation.adminLabel")}</SidebarGroupLabel>
        <SidebarGroupContent><MenuLinks items={administration} /></SidebarGroupContent>
      </SidebarGroup> : null}
    </SidebarContent>
    <SidebarFooter className="border-t border-sidebar-border p-2">
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton render={<Link href="/account" onClick={() => { if (isMobile) setOpenMobile(false); }} />} isActive={pathname.startsWith("/account")} tooltip={t("navigation.account")}>
            <Avatar size="sm"><AvatarFallback><UserRound size={14} aria-hidden="true" />{initials}</AvatarFallback></Avatar>
            <span>{user.login}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
    <SidebarRail />
  </Sidebar>;
}
