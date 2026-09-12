import type { ReactNode } from "react";
import { Suspense } from "react";
import { Alert, Button, Card, Skeleton } from "antd";
import { CompactPageHeading } from "./compact-page-heading";
import { AccountNavigation } from "./account-navigation";
import { AccountSignOutSection } from "./account-sign-out-section";
import { AccountNotificationsWorkspace } from "./account-notifications-workspace";
import { loadAccountNotificationsState } from "../lib/account/account-notifications-server";
import type { AppLocale } from "../i18n/locales";
import { createTranslator } from "../i18n/core";

async function NotificationsLoader({ locale, deliveryLimited }: Readonly<{ locale: AppLocale; deliveryLimited: boolean }>) {
  const state = await loadAccountNotificationsState();
  if (state.availability === "unavailable") {
    const t = createTranslator(locale);
    return <>
      <Alert type="error" showIcon title={t("account.overview.statusUnavailable")} description={t("account.overview.summaryUnavailableHelp")} />
      <div className="account-notifications__actions">
        <Button href="/account/notifications">{t("common.retry")}</Button>
      </div>
    </>;
  }
  return <AccountNotificationsWorkspace baseline={state.baseline} connection={state.connection} deliveryLimited={deliveryLimited} />;
}

export function AccountNotifications({ locale, deliveryLimited, signOutAction }: Readonly<{ locale: AppLocale; deliveryLimited: boolean; signOutAction?: ReactNode }>) {
  const t = createTranslator(locale);
  return <div className="account-workspace">
    <header className="account-workspace__heading">
      <CompactPageHeading title={t("account.navigation.notifications")} subtitle={t("account.notifications.subtitle")} />
    </header>
    <AccountNavigation activePath="/account/notifications" locale={locale} />

    <div className="account-workspace__body">
      <Card className="account-notifications-card">
        <div className="account-security__inner">
          <h2 id="account-notifications-heading" className="account-notifications__title">{t("account.notifications.personalTitle")}</h2>
          <Suspense
            fallback={<div role="status" aria-live="polite" aria-busy="true"><Skeleton active paragraph={{ rows: 4 }} title={false} /></div>}
          >
            <NotificationsLoader locale={locale} deliveryLimited={deliveryLimited} />
          </Suspense>
        </div>
      </Card>

      <AccountSignOutSection locale={locale} action={signOutAction} />
    </div>
  </div>;
}
