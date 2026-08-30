"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Avatar, Button, Drawer, Dropdown, Flex, Grid, Menu, Space } from "antd";
import type { MenuProps } from "antd";
import { CarOutlined, MenuOutlined } from "@ant-design/icons";
import { Header } from "antd/es/layout/layout";
import { adminNavigationFor } from "@/lib/admin-navigation";
import { isActiveAppNavigationPath, navigationFor } from "@/lib/app-navigation";
import { useI18n } from "../i18n/client";
import { useAuth } from "./auth-provider";
import { LanguageSelector } from "./language-selector";
import { useLogout } from "./logout-button";

type NavigationItem = Readonly<{ href: string; label: string }>;

export function AppNavigation() {
  const pathname = usePathname(); const user = useAuth(); const { locale, t } = useI18n();
  const screens = Grid.useBreakpoint(); const compact = !screens.lg;
  const allNavigation = navigationFor(user, locale);
  const primary = allNavigation.filter((item) => !item.href.startsWith("/admin/"));
  const administration = adminNavigationFor(user, locale);
  const administrationLabel = allNavigation.find((item) => item.href.startsWith("/admin/"))?.label ?? t("common.administration");

  if (pathname === "/login") return <Header className="taxi-header taxi-header-login"><Flex className="taxi-header__inner" align="center" justify="space-between"><Brand /><LanguageSelector /></Flex></Header>;
  if (compact) return <CompactNavigation pathname={pathname} primary={primary} administration={administration} administrationLabel={administrationLabel} />;
  return <Header className="taxi-header"><Flex className="taxi-header__inner" align="center" gap="middle"><Brand /><Menu aria-label={t("navigation.primaryLabel")} className="taxi-header__menu" mode="horizontal" theme="dark" selectedKeys={selectedKeys(primary, administration, pathname)} items={menuItems(primary, administration, administrationLabel)} /><Space size="middle"><LanguageSelector />{user ? <AccountMenu login={user.login} /> : null}</Space></Flex></Header>;
}

function CompactNavigation({ pathname, primary, administration, administrationLabel }: Readonly<{ pathname: string; primary: readonly NavigationItem[]; administration: readonly NavigationItem[]; administrationLabel: string }>) {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();
  return <Header className="taxi-header"><Flex className="taxi-header__inner" align="center" justify="space-between"><Brand /><Button icon={<MenuOutlined />} aria-label={t("navigation.openMenu")} onClick={() => setOpen(true)} /><Drawer title="Taxi GPS" placement="right" size={320} open={open} onClose={() => setOpen(false)}><Space orientation="vertical" size="large" style={{ width: "100%" }}><Menu mode="inline" selectedKeys={selectedKeys(primary, administration, pathname)} items={menuItems(primary, administration, administrationLabel, () => setOpen(false))} /><LanguageSelector /><MobileAccount /></Space></Drawer></Flex></Header>;
}

function Brand() { return <Flex className="taxi-header__brand" align="center" gap="small"><CarOutlined /><span>Taxi GPS</span></Flex>; }

function AccountMenu({ login }: Readonly<{ login: string }>) {
  const { busy, label, logout } = useLogout(); const { t } = useI18n();
  const items: MenuProps["items"] = [{ key: "account", label: <Link href="/account">{t("account.open")}</Link> }, { type: "divider" }, { key: "logout", label }];
  return <Dropdown menu={{ items, onClick: ({ key }) => { if (key === "logout") void logout(); } }} trigger={["click"]}><Button loading={busy} icon={<Avatar size="small">{login.slice(0, 1).toUpperCase()}</Avatar>}>{login}</Button></Dropdown>;
}

function MobileAccount() { const user = useAuth(); return user ? <AccountMenu login={user.login} /> : null; }

function menuItems(primary: readonly NavigationItem[], administration: readonly NavigationItem[], administrationLabel: string, afterNavigation?: () => void): MenuProps["items"] {
  const link = (item: NavigationItem) => <Link href={item.href} onClick={afterNavigation}>{item.label}</Link>;
  const items: NonNullable<MenuProps["items"]> = primary.map((item) => ({ key: item.href, label: link(item) }));
  if (administration.length > 0) items.push({ key: "administration", label: administrationLabel, children: administration.map((item) => ({ key: `administration:${item.href}`, label: link(item) })) });
  return items;
}

function selectedKeys(primary: readonly NavigationItem[], administration: readonly NavigationItem[], pathname: string): string[] {
  const admin = administration.find((item) => isActiveAppNavigationPath(item.href, pathname));
  if (admin) return [`administration:${admin.href}`];
  const current = primary.find((item) => isActiveAppNavigationPath(item.href, pathname));
  return current ? [current.href] : [];
}
