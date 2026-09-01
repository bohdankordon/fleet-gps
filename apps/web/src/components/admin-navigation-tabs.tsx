"use client";

import { useRouter } from "next/navigation";
import { usePathname } from "next/navigation";
import { Tabs } from "antd";
import { useI18n } from "../i18n/client";
import { activeAdminNavigationPath, adminNavigationFor } from "../lib/admin-navigation";
import { useAuth } from "./auth-provider";

export function AdminNavigationTabs() {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuth();
  const { locale, t } = useI18n();
  const items = adminNavigationFor(user, locale);
  const activeKey = activeAdminNavigationPath(items, pathname);

  if (items.length === 0) return null;

  const navigate = (href: string) => router.push(href);
  return <nav className="admin-navigation-tabs" aria-label={t("navigation.adminTabsLabel")}>
    <Tabs
      activeKey={activeKey}
      animated={false}
      items={items.map((item) => ({ key: item.href, label: item.label }))}
      onChange={navigate}
      onTabClick={(href) => { if (href === activeKey) navigate(href); }}
    />
  </nav>;
}
