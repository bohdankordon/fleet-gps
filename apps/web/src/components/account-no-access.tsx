import type { ReactNode } from "react";
import { Button, Card, Tag } from "antd";
import { CompactPageHeading } from "./compact-page-heading";
import { AccountNavigation } from "./account-navigation";
import { AccountSignOutSection } from "./account-sign-out-section";
import type { AppLocale } from "../i18n/locales";
import { createTranslator } from "../i18n/core";

// Neutral landing for an authenticated account with no product-section
// access: explains the state, keeps personal settings reachable, and offers
// Account Overview as the single recovery path. Never an error surface.
export function AccountNoAccess({ locale, signOutAction }: Readonly<{ locale: AppLocale; signOutAction?: ReactNode }>) {
  const t = createTranslator(locale);
  return <div className="account-workspace">
    <header className="account-workspace__heading">
      <CompactPageHeading title={t("account.noaccess.title")} subtitle={t("account.noaccess.subtitle")} />
    </header>
    <AccountNavigation activePath="/account/no-access" locale={locale} />

    <div className="account-workspace__body">
      <Card className="account-noaccess-card">
        <div className="account-security__inner">
          <h2 id="account-noaccess-heading" className="account-noaccess__title">{t("account.noaccess.accessLabel")}</h2>
          <p className="account-noaccess__state"><Tag>{t("account.noaccess.noAccessState")}</Tag></p>
          <p className="account-noaccess__supporting">{t("account.noaccess.stateText")}</p>
          <div className="account-noaccess__fact">
            <h3 className="account-noaccess__label">{t("account.noaccess.personalTitle")}</h3>
            <p className="account-noaccess__value">{t("account.noaccess.personalText")}</p>
          </div>
          <div className="account-noaccess__fact">
            <h3 className="account-noaccess__label">{t("account.noaccess.adminTitle")}</h3>
            <p className="account-noaccess__value">{t("account.noaccess.adminText")}</p>
          </div>
          <div className="account-noaccess__actions">
            <Button type="primary" href="/account">{t("account.noaccess.openAccount")}</Button>
          </div>
        </div>
      </Card>

      <AccountSignOutSection locale={locale} action={signOutAction} />
    </div>
  </div>;
}
