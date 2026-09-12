import type { ReactNode } from "react";
import { Card } from "antd";
import { CompactPageHeading } from "./compact-page-heading";
import { AccountNavigation } from "./account-navigation";
import { AccountSignOutSection } from "./account-sign-out-section";
import { AccountTelegramWorkspace, type TelegramWorkspaceInitial } from "./account-telegram-workspace";
import type { AppLocale } from "../i18n/locales";
import { createTranslator } from "../i18n/core";

export function AccountTelegram({ initial, locale, signOutAction }: Readonly<{ initial: TelegramWorkspaceInitial; locale: AppLocale; signOutAction?: ReactNode }>) {
  const t = createTranslator(locale);
  return <div className="account-workspace">
    <header className="account-workspace__heading">
      <CompactPageHeading title={t("telegram.title")} subtitle={t("account.telegram.subtitle")} />
    </header>
    <AccountNavigation activePath="/account/telegram" locale={locale} />

    <div className="account-workspace__body">
      <Card className="account-telegram-card">
        <div className="account-security__inner">
          <h2 id="account-telegram-heading" className="account-telegram__title">{t("account.telegram.connectionTitle")}</h2>
          <div className="account-telegram__body">
            <AccountTelegramWorkspace initial={initial} locale={locale} />
          </div>
        </div>
      </Card>

      <AccountSignOutSection locale={locale} action={signOutAction} />
    </div>
  </div>;
}
