
import Link from "next/link";
import { Menu } from "antd";
import type { AppLocale } from "../i18n/locales";
import { translate } from "../i18n/core";
import { accountNavigationFor, activeAccountNavigationPath } from "../lib/account/account-navigation";
import { AccountNavigationSelect } from "./account-navigation-select";

export function AccountNavigation({ activePath, locale }: Readonly<{ activePath: string; locale: AppLocale }>) {
  const items = accountNavigationFor(locale);
  // Routes outside the four Account destinations (for example
  // /account/no-access) truthfully select nothing instead of borrowing
  // another section's active state.
  const activeHref = activeAccountNavigationPath(activePath);
  const label = translate(locale, "account.navigation.label");
  const mobileLabel = translate(locale, "account.navigation.mobileLabel");

  // Desktop/tablet uses the accepted Taxi GPS horizontal route-menu grammar;
  // narrow viewports use a labelled compact selector (no cramped four-label row).
  // Both are rendered for SSR/testability; CSS selects the visible variant.
  return <nav className="account-navigation" aria-label={label}>
    <div className="account-navigation__desktop">
      <Menu
        mode="horizontal"
        selectedKeys={activeHref ? [activeHref] : []}
        items={items.map((item) => ({
          key: item.href,
          label: <Link href={item.href} aria-current={item.href === activeHref ? "page" : undefined}>{item.label}</Link>,
        }))}
      />
    </div>
    <AccountNavigationSelect items={items} activeHref={activeHref} label={label} mobileLabel={mobileLabel} />
  </nav>;
}
