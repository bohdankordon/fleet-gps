import Link from "next/link";
import { Avatar, Button, Card, Tag } from "antd";
import { CompactPageHeading } from "./compact-page-heading";
import { AccountNavigation } from "./account-navigation";
import { AccountSignOutSection } from "./account-sign-out-section";
import type { AuthUser } from "../lib/auth/auth-contract";
import type { AccountNotificationSummaryState, AccountTelegramStatus } from "../lib/account/account-notification-summary";
import { permissionLabel, roleLabel } from "../i18n/domain-labels";
import type { AppLocale } from "../i18n/locales";
import { createTranslator } from "../i18n/core";
import type { ReactNode } from "react";

function telegramTagColor(status: AccountTelegramStatus): "success" | "default" | "processing" | "warning" {
  if (status === "CONNECTED") return "success";
  if (status === "BROKEN") return "warning";
  if (status === "LINK_PENDING") return "processing";
  return "default";
}

export function AccountOverview({ user, summaryState, locale, signOutAction }: Readonly<{ user: AuthUser; summaryState: AccountNotificationSummaryState; locale: AppLocale; signOutAction?: ReactNode }>) {
  const t = createTranslator(locale);
  // Correctness boundary (preserved): ADMIN keeps full-authority copy, USER gets a
  // localized human-readable permission summary, never raw enum identifiers.
  const access = user.role === "ADMIN"
    ? t("account.overview.access.admin")
    : user.permissions.length > 0
      ? user.permissions.map((permission) => permissionLabel(permission, locale)).join(", ")
      : t("account.overview.access.none");
  // Correctness boundary (preserved): unavailable reads stay unavailable, no virtual
  // defaults; only a safe count/scope projection without identifiers or secrets.
  const summary = summaryState.availability === "available" ? summaryState.summary : null;
  const telegramStatus = summary?.telegramStatus;
  const eventTypes = summary
    ? [summary.preferences.speedingEnabled ? t("telegram.preferences.speeding") : null, summary.preferences.inactivityEnabled ? t("telegram.preferences.inactivity") : null].filter((value): value is string => value !== null)
    : [];
  const eventLine = summary
    ? eventTypes.length > 0 ? eventTypes.join(" · ") : t("account.overview.notifications.noEvents")
    : "";
  const vehicleScope = summary
    ? !summary.preferences.canSelectVehicles
      ? t("account.overview.notifications.scopeUnavailable")
      : summary.preferences.vehicleScope === "ALL"
        ? t("telegram.preferences.allVehicles")
        : t("telegram.preferences.selectedCount", { count: summary.preferences.selectedVehicleCount })
    : null;
  const deliveryUnavailable = telegramStatus !== undefined && telegramStatus !== "CONNECTED";

  // Avatar shows the first visible login character only; the login itself
  // remains the readable text, so the avatar is hidden from assistive tech.
  const loginInitial = (Array.from(user.login.trim())[0] ?? "?").toUpperCase();

  return <div className="account-workspace">
    <header className="account-workspace__heading">
      <CompactPageHeading title={t("account.title")} subtitle={t("account.overview.subtitle")} />
    </header>
    <AccountNavigation activePath="/account" locale={locale} />

    <div className="account-workspace__body">
      <Card className="account-identity-card">
        <div className="account-identity">
          <Avatar className="account-identity__avatar" aria-hidden="true">{loginInitial}</Avatar>
          <div className="account-identity__text">
            <p className="account-identity__login">{user.login}</p>
            <p className="account-identity__role">{roleLabel(user.role, locale)}</p>
            <p className="account-identity__access">{access}</p>
          </div>
        </div>
      </Card>

      <Card className="account-settings">
        <h2 id="account-settings-heading" className="account-settings__title">{t("account.overview.personalTitle")}</h2>
        <ul className="account-settings__list" aria-label={t("account.overview.settingsLabel")}>
          <li className="account-settings__row">
            <div className="account-settings__fact">
              <h3 id="account-security-heading" className="account-settings__name">{t("account.navigation.security")}</h3>
              <p className="account-settings__status">{user.mustChangePassword ? t("account.overview.security.required") : t("account.overview.security.notRequired")}</p>
              {user.mustChangePassword ? <p className="account-settings__supporting">{t("auth.password.mustChange")}</p> : null}
            </div>
            <div className="account-settings__action">
              <Button href="/account/change-password" aria-describedby="account-security-heading">{t("account.overview.security.action")}</Button>
            </div>
          </li>

          <li className="account-settings__row">
          <div className="account-settings__fact">
              <h3 id="account-telegram-heading" className="account-settings__name">{t("account.navigation.telegram")}</h3>
              {telegramStatus
                ? <><p className="account-settings__status"><Tag color={telegramTagColor(telegramStatus)}>{t(`telegram.label.${telegramStatus}`)}</Tag></p>{telegramStatus === "NOT_CONNECTED" ? <p className="account-settings__supporting">{t("account.overview.telegram.connectHelp")}</p> : null}{telegramStatus === "BROKEN" ? <p className="account-settings__supporting">{t("account.overview.telegram.brokenHelp")}</p> : null}</>
                : <><p className="account-settings__status">{t("account.overview.statusUnavailable")}</p><p className="account-settings__supporting">{t("account.overview.summaryUnavailableHelp")} <Link href="/account">{t("common.retry")}</Link></p></>}
            </div>
            <div className="account-settings__action">
              <Button href="/account/telegram" aria-describedby="account-telegram-heading">{t("account.overview.telegram.action")}</Button>
            </div>
          </li>

          <li className="account-settings__row">
            <div className="account-settings__fact">
              <h3 id="account-notifications-heading" className="account-settings__name">{t("account.navigation.notifications")}</h3>
              {summary
                ? <>
                  <p className="account-settings__status"><Tag color={summary.preferences.enabled ? "success" : "default"}>{summary.preferences.enabled ? t("account.overview.notifications.on") : t("account.overview.notifications.off")}</Tag></p>
                  <p className="account-settings__supporting">{eventLine} · {vehicleScope}</p>
                  {deliveryUnavailable ? <p className="account-settings__supporting">{t("account.overview.notifications.needsTelegram")}</p> : null}
                </>
                : <><p className="account-settings__status">{t("account.overview.statusUnavailable")}</p><p className="account-settings__supporting">{t("account.overview.summaryUnavailableHelp")} <Link href="/account">{t("common.retry")}</Link></p></>}
            </div>
            <div className="account-settings__action">
              <Button href="/account/notifications" aria-describedby="account-notifications-heading">{t("account.overview.notifications.action")}</Button>
            </div>
          </li>
        </ul>
      </Card>

      <AccountSignOutSection locale={locale} action={signOutAction} />
    </div>
  </div>;
}
