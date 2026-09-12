import type { ReactNode } from "react";
import { Alert, Card, Divider, Tag } from "antd";
import { CompactPageHeading } from "./compact-page-heading";
import { AccountNavigation } from "./account-navigation";
import { AccountSecurityForm } from "./account-security-form";
import { AccountSignOutSection } from "./account-sign-out-section";
import type { AuthUser } from "../lib/auth/auth-contract";
import type { AppLocale } from "../i18n/locales";
import { createTranslator } from "../i18n/core";

export function AccountSecurity({ user, locale, signOutAction, formAction }: Readonly<{ user: AuthUser; locale: AppLocale; signOutAction?: ReactNode; formAction?: ReactNode }>) {
  const t = createTranslator(locale);
  return <div className="account-workspace">
    <header className="account-workspace__heading">
      <CompactPageHeading title={t("account.navigation.security")} subtitle={t("account.security.subtitle")} />
    </header>
    <AccountNavigation activePath="/account/change-password" locale={locale} />

    <div className="account-workspace__body">
      <Card className="account-security-card">
        <div className="account-security__inner">
          <h2 id="account-security-heading" className="account-security__title">{t("auth.password.title")}</h2>
          <div className="account-security__context">
            {user.mustChangePassword
              ? <Alert className="account-security__notice" type="warning" showIcon title={t("account.security.requiredAlert")} />
              : <div className="account-security__fact">
                <h3 className="account-security__label">{t("common.status")}</h3>
                <p className="account-security__value"><Tag>{t("account.overview.security.notRequired")}</Tag></p>
              </div>}
            <div className="account-security__fact">
              <h3 className="account-security__label">{t("account.security.sessionsLabel")}</h3>
              <p className="account-security__value">{t("account.security.sessionsNote")}</p>
            </div>
            <div className="account-security__fact">
              <h3 className="account-security__label">{t("account.security.requirementsLabel")}</h3>
              <p className="account-security__value">{t("account.security.requirementsValue")}</p>
            </div>
          </div>
          <Divider className="account-security__divider" />
          <div className="account-security__form">
            {formAction ?? <AccountSecurityForm mandatory={user.mustChangePassword} />}
          </div>
        </div>
      </Card>

      <AccountSignOutSection locale={locale} action={signOutAction} />
    </div>
  </div>;
}
