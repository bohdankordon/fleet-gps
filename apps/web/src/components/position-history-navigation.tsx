"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Grid, Menu, Select, Space, Typography } from "antd";
import { useI18n } from "../i18n/client";
import { activePositionHistoryPath, positionHistoryNavigationFor } from "../lib/position-history-navigation";

export function PositionHistoryNavigation({ anchor, isAdmin }: Readonly<{ anchor: string | null; isAdmin: boolean }>) {
  const pathname = usePathname();
  const router = useRouter();
  const screens = Grid.useBreakpoint();
  const { locale, t } = useI18n();
  const items = positionHistoryNavigationFor(anchor, isAdmin, locale);
  const activePath = activePositionHistoryPath(pathname);
  const activeItem = items.find((item) => item.href.split("?")[0] === activePath) ?? items[0]!;

  return <nav className="history-navigation" aria-label={t("history.navigation.label")}>
    {screens.md
      ? <Menu mode="horizontal" selectedKeys={[activePath]} items={items.map((item) => ({ key: item.href.split("?")[0]!, label: <Link href={item.href} aria-current={item.href.split("?")[0] === activePath ? "page" : undefined}>{item.label}</Link> }))} />
      : <Space className="history-navigation__mobile" orientation="vertical" size={4}>
          <Typography.Text type="secondary">{t("history.navigation.switcher")}</Typography.Text>
          <Select size="large" aria-label={t("history.navigation.switcher")} value={activeItem.href} onChange={(href) => router.push(href)} options={items.map((item) => ({ value: item.href, label: item.label }))} />
        </Space>}
  </nav>;
}
