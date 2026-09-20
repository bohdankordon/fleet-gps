"use client";

import type { CSSProperties, ReactNode } from "react";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AuditOutlined,
  DownOutlined,
  EnvironmentFilled,
  HistoryOutlined,
  LogoutOutlined,
  MenuOutlined,
  SettingOutlined,
  TeamOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Avatar, Button, Divider, Drawer, Dropdown, Grid, Menu, theme } from "antd";
import type { MenuProps } from "antd";
import { Header } from "antd/es/layout/layout";
import { activeAdminNavigationPath, adminNavigationFor } from "@/lib/admin-navigation";
import { isActiveAppNavigationPath, navigationFor } from "@/lib/app-navigation";
import { useI18n } from "../i18n/client";
import { useAuth } from "./auth-provider";
import { LanguageSelector } from "./language-selector";
import { useLogout } from "./logout-button";

type NavigationItem = Readonly<{ href: string; label: string }>;
type ShellTokenStyle = CSSProperties & Readonly<Record<`--shell-${string}`, string>>;

export function AppNavigation() {
  const pathname = usePathname();
  const user = useAuth();
  const { locale, t } = useI18n();
  const { token } = theme.useToken();
  const screens = Grid.useBreakpoint();
  const compact = !screens.lg;
  // Temporary restricted onboarding state: authenticated with a temporary
  // password. Product, Administration, and Account destinations stay hidden
  // on both desktop and compact compositions.
  const restricted = user?.mustChangePassword === true;
  const allNavigation = restricted ? [] : navigationFor(user, locale);
  const primary = allNavigation.filter((item) => !item.href.startsWith("/admin/"));
  const administration = restricted ? [] : adminNavigationFor(user, locale);
  const administrationParent = restricted ? undefined : allNavigation.find((item) => item.href.startsWith("/admin/"));
  const administrationLabel = administrationParent?.label ?? t("common.administration");
  const shellTokens = {
    "--shell-bg": token.colorBgContainer,
    "--shell-border": token.colorBorderSecondary,
    "--shell-primary": token.colorPrimary,
    "--shell-primary-bg": token.colorPrimaryBg,
    "--shell-shadow": token.boxShadowSecondary,
    "--shell-text": token.colorText,
    "--shell-text-secondary": token.colorTextSecondary,
  } as ShellTokenStyle;
  const shellStyle = {
    ...shellTokens,
    backgroundColor: token.colorBgContainer,
    borderColor: token.colorBorderSecondary,
    color: token.colorText,
    height: 58,
    lineHeight: "normal",
    paddingInline: 0,
  } as ShellTokenStyle;

  const shared = { pathname, primary, administration, administrationParent, administrationLabel, shellStyle, shellTokens, restricted };

  if (pathname === "/login") {
    return <Header className="taxi-header taxi-header--login" style={shellStyle}><div className="taxi-header__inner"><Brand /><LanguageSelector /></div></Header>;
  }
  if (compact) return <CompactNavigation {...shared} login={user?.login ?? null} />;
  return <DesktopNavigation pathname={pathname} navigation={allNavigation} login={user?.login ?? null} shellStyle={shellStyle} restricted={restricted} />;
}

function DesktopNavigation({ pathname, navigation, login, shellStyle, restricted }: Readonly<{
  pathname: string;
  navigation: readonly NavigationItem[];
  login: string | null;
  shellStyle: ShellTokenStyle;
  restricted: boolean;
}>) {
  const { t } = useI18n();
  return <Header className="taxi-header" style={shellStyle}>
    <div className="taxi-header__inner">
      <Brand staticMode={restricted} />
      {restricted || navigation.length === 0 ? null : (
        <nav className="taxi-header__nav" aria-label={t("navigation.primaryLabel")}>
          {navigation.map((item) => {
            const active = isActiveAppNavigationPath(item.href, pathname);
            return <Link className={`taxi-header__nav-link${active ? " taxi-header__nav-link--active" : ""}`} key={item.href} href={item.href} aria-current={active ? "page" : undefined}>{item.label}</Link>;
          })}
        </nav>
      )}
      <div className="taxi-header__tools">
        <LanguageSelector />
        {login ? <AccountMenu login={login} restricted={restricted} /> : null}
      </div>
    </div>
  </Header>;
}

function CompactNavigation({ pathname, primary, administration, administrationParent, administrationLabel, shellStyle, shellTokens, restricted, login }: Readonly<{
  pathname: string;
  primary: readonly NavigationItem[];
  administration: readonly NavigationItem[];
  administrationParent: NavigationItem | undefined;
  administrationLabel: string;
  shellStyle: ShellTokenStyle;
  shellTokens: ShellTokenStyle;
  restricted: boolean;
  login: string | null;
}>) {
  const [open, setOpen] = useState(false);
  const user = useAuth();
  const { t } = useI18n();
  const close = () => setOpen(false);
  const selectedAdmin = activeAdminNavigationPath(administration, pathname);

  return <Header className="taxi-header taxi-header--compact" style={shellStyle}>
    <div className="taxi-header__inner">
      <Brand staticMode={restricted} />
      <Button className="taxi-header__mobile-trigger" type="text" size="large" icon={<MenuOutlined aria-hidden />} aria-label={t("navigation.openMenu")} onClick={() => setOpen(true)} />
      <Drawer className="taxi-navigation-drawer" style={shellTokens} title={<Brand staticMode={restricted} />} placement="right" size={360} open={open} onClose={close} destroyOnHidden>
        {restricted ? null : (
          <nav className="taxi-navigation-drawer__nav" aria-label={t("navigation.primaryLabel")}>
            <Menu mode="inline" selectedKeys={selectedPrimaryKeys(primary, pathname)} items={primary.map((item) => ({ key: item.href, label: <Link href={item.href} onClick={close}>{item.label}</Link> }))} />
            {administrationParent && administration.length > 0 ? <section className="taxi-navigation-drawer__administration">
              <Link className="taxi-navigation-drawer__administration-link" href={administrationParent.href} aria-current={pathname.startsWith("/admin/") ? "location" : undefined} onClick={close}>
                <span>{administrationLabel}</span>
              </Link>
              <Menu mode="inline" selectedKeys={selectedAdmin ? [selectedAdmin] : []} items={administration.map((item) => ({ key: item.href, icon: adminIcon(item.href), label: <Link href={item.href} onClick={close}>{item.label}</Link> }))} />
            </section> : null}
          </nav>
        )}
        <Divider />
        <div className="taxi-navigation-drawer__tools">
          <LanguageSelector />
          {user ?? login ? <AccountMenu login={user?.login ?? login ?? ""} restricted={restricted} afterNavigation={close} /> : null}
        </div>
      </Drawer>
    </div>
  </Header>;
}

function Brand({ staticMode }: Readonly<{ staticMode?: boolean }>) {
  if (staticMode) {
    return <span className="taxi-header__brand taxi-header__brand--static" aria-hidden={false}><EnvironmentFilled className="taxi-header__brand-icon" aria-hidden /><span>Fleet GPS</span></span>;
  }
  return <Link className="taxi-header__brand" href="/"><EnvironmentFilled className="taxi-header__brand-icon" aria-hidden /><span>Fleet GPS</span></Link>;
}

function AccountMenu({ login, afterNavigation, restricted }: Readonly<{ login: string; afterNavigation?: () => void; restricted?: boolean }>) {
  const [open, setOpen] = useState(false);
  const { busy, label, logout } = useLogout();
  const { t } = useI18n();
  const items: MenuProps["items"] = restricted
    ? [{ key: "logout", danger: true, icon: <LogoutOutlined aria-hidden />, label }]
    : [
      { key: "account", icon: <UserOutlined aria-hidden />, label: <Link href="/account" onClick={() => { setOpen(false); afterNavigation?.(); }}>{t("account.open")}</Link> },
      { type: "divider" },
      { key: "logout", danger: true, icon: <LogoutOutlined aria-hidden />, label },
    ];
  return <Dropdown open={open} onOpenChange={setOpen} menu={{ items, onClick: ({ key }) => { if (key === "logout") { setOpen(false); void logout(); } } }} trigger={["click"]} placement="bottomRight">
    <Button className="taxi-header__control taxi-header__account-control" type="text" size="small" loading={busy} aria-label={t("account.openMenu")} aria-expanded={open} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") { event.preventDefault(); setOpen(true); } }}>
      <Avatar size={24}>{login.slice(0, 1).toUpperCase()}</Avatar>
      <span className="taxi-header__account-name">{login}</span>
      <DownOutlined aria-hidden />
    </Button>
  </Dropdown>;
}

function adminIcon(href: string): ReactNode {
  if (href === "/admin/users") return <TeamOutlined aria-hidden />;
  if (href === "/admin/settings") return <SettingOutlined aria-hidden />;
  if (href === "/admin/audit") return <AuditOutlined aria-hidden />;
  if (href === "/admin/history") return <HistoryOutlined aria-hidden />;
  return null;
}

function selectedPrimaryKeys(primary: readonly NavigationItem[], pathname: string): string[] {
  const current = primary.find((item) => isActiveAppNavigationPath(item.href, pathname));
  return current ? [current.href] : [];
}
