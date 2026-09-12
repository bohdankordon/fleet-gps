import type { ReactNode } from "react";
import { LogoutButton } from "./logout-button";
import type { AppLocale } from "../i18n/locales";
import { createTranslator } from "../i18n/core";

// The single accepted Account sign-out surface, shared by Overview and
// Security so the composition, rhythm, and danger interaction cannot drift.
export function AccountSignOutSection({ locale, action }: Readonly<{ locale: AppLocale; action?: ReactNode }>) {
  const t = createTranslator(locale);
  return <section className="account-signout" aria-labelledby="account-signout-heading">
    <div className="account-signout__fact">
      <h2 id="account-signout-heading" className="account-signout__title">{t("account.overview.signout.title")}</h2>
      <p className="account-signout__help">{t("account.overview.signout.help")}</p>
    </div>
    <div className="account-signout__action">{action ?? <LogoutButton danger />}</div>
  </section>;
}
