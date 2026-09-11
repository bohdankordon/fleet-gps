"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Grid, Menu, Select, Space, Typography } from "antd";
import { useI18n } from "../i18n/client";
import { activeAdminNavigationPath, adminNavigationFor } from "../lib/admin-navigation";
import { useAuth } from "./auth-provider";
import { isBusinessSettingsNavigationBlocked, notifyBusinessSettingsBlockedNavigation } from "./business-settings-leave-guard";

export function AdminNavigationTabs() {
  const pathname = usePathname();
  const router = useRouter();
  const screens = Grid.useBreakpoint();
  const user = useAuth();
  const { locale, t } = useI18n();
  const items = adminNavigationFor(user, locale);
  const activeKey = activeAdminNavigationPath(items, pathname);

  if (items.length === 0) return null;

  function handleMobileNavigate(href: string): void {
    if (isBusinessSettingsNavigationBlocked()) {
      notifyBusinessSettingsBlockedNavigation(href);
      return;
    }
    router.push(href);
  }

  return <nav className="admin-navigation-tabs" aria-label={t("navigation.adminTabsLabel")}>
    {screens.md ? <Menu mode="horizontal" selectedKeys={activeKey ? [activeKey] : []} items={items.map((item) => ({ key: item.href, label: <Link href={item.href} aria-current={item.href === activeKey ? "page" : undefined}>{item.label}</Link> }))} /> : <Space className="admin-navigation-tabs__mobile" orientation="vertical" size={4}><Typography.Text type="secondary">{t("navigation.adminSwitcherLabel")}</Typography.Text><Select className="admin-navigation-tabs__select" size="large" aria-label={t("navigation.adminSwitcherLabel")} value={activeKey ?? items[0]!.href} onChange={handleMobileNavigate} options={items.map((item) => ({ value: item.href, label: item.label }))} /></Space>}
  </nav>;
}
