import type { ReactNode } from "react";
import { Alert, Card, Divider } from "antd";
import { CompactPageHeading } from "./compact-page-heading";
import { AccountNavigation } from "./account-navigation";
import { AccountSecurityForm } from "./account-security-form";
import { AccountSignOutSection } from "./account-sign-out-section";
import type { AuthUser } from "../lib/auth/auth-contract";
import type { AppLocale } from "../i18n/locales";
import { createTranslator } from "../i18n/core";

export function AccountSecurity({ user, locale, signOutAction, formAction }: Readonly<{ user: AuthUser; locale: AppLocale; signOutAction?: ReactNode; formAction?: ReactNode }>) {
  const t = createTranslator(locale);
  const mandatory = user.mustChangePassword === true;
  return <div className="account-workspace">
    <header className="account-workspace__heading">
      <CompactPageHeading
        title={mandatory ? t("account.security.mandatoryTitle") : t("account.navigation.security")}
        subtitle={mandatory ? t("account.security.mandatorySubtitle") : t("account.security.subtitle")}
      />
    </header>
    {mandatory ? null : <AccountNavigation activePath="/account/change-password" locale={locale} />}

    <div className="account-workspace__body">
      <Card className="account-security-card">
        <div className="account-security__inner">
          <h2 id="account-security-heading" className="account-security__title">{t(mandatory ? "auth.password.createTitle" : "auth.password.title")}</h2>
          <div className="account-security__context">
            {mandatory
              ? <Alert className="account-security__notice" type="warning" showIcon title={t("account.security.mandatoryWarning")} />
              : null}
            <div className="account-security__fact">
              <h3 className="account-security__label">{t("account.security.sessionsLabel")}</h3>
              <p className="account-security__value">{t("account.security.sessionsNote")}</p>
            </div>
          </div>
          <Divider className="account-security__divider" />
          <div className="account-security__form">
            {formAction ?? <AccountSecurityForm mandatory={mandatory} />}
          </div>
        </div>
      </Card>

      <AccountSignOutSection locale={locale} action={signOutAction} />
    </div>
  </div>;
}
