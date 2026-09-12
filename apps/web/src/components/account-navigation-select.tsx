"use client";

import { Select, Space, Typography } from "antd";
import type { AccountNavigationItem } from "../lib/account/account-navigation";

export function AccountNavigationSelect({ items, activeHref, label, mobileLabel }: Readonly<{ items: readonly AccountNavigationItem[]; activeHref: string; label: string; mobileLabel: string }>) {
  function handleMobileNavigate(href: string): void {
    if (href !== activeHref && typeof window !== "undefined") window.location.href = href;
  }

  return <Space className="account-navigation__mobile" orientation="vertical" size={4}>
    <Typography.Text type="secondary">{mobileLabel}</Typography.Text>
    <Select
      className="account-navigation__select"
      size="large"
      aria-label={label}
      value={activeHref}
      onChange={handleMobileNavigate}
      options={items.map((item) => ({ value: item.href, label: item.label }))}
    />
  </Space>;
}
