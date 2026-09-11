import { redirect } from "next/navigation";
import { BusinessSettingsWorkspace } from "@/components/business-settings-workspace";
import { AdminNavigationTabs } from "@/components/admin-navigation-tabs";
import { requireAuthUser } from "@/lib/auth/auth-user";
import { fetchAdminSettings } from "@/lib/admin-settings/admin-settings-client";
import { DISPLAY_LOCALES } from "@/i18n/locales";
import { getServerI18n } from "@/i18n/server";
export const dynamic = "force-dynamic"; export const revalidate = 0;
function formatSettingsUpdatedAt(locale: keyof typeof DISPLAY_LOCALES, iso: string, timeZone: string): string | null {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(DISPLAY_LOCALES[locale], { dateStyle: "medium", timeStyle: "short", timeZone }).format(date);
  } catch {
    return null;
  }
}

export default async function AdminSettingsPage() {
  const [user, { locale, t }] = await Promise.all([requireAuthUser(), getServerI18n()]);
  if (user.role !== "ADMIN") redirect("/forbidden");
  let settings = null;
  try {
    settings = await fetchAdminSettings();
  } catch {}
  const updatedAt = settings ? (formatSettingsUpdatedAt(locale, settings.updatedAt, settings.timezone) ?? settings.updatedAt) : null;
  return (
    <div className="business-settings-page">
      <header className="business-settings-header">
        <h1>{t("admin.settings.title")}</h1>
        <p>{t("admin.settings.tagline")}</p>
        {settings ? (
          <p className="business-settings-meta">
            <span>{t("admin.settings.revision", { revision: settings.revision })}</span>
            <span>{t("admin.settings.updatedPrefix")} <time dateTime={settings.updatedAt}>{updatedAt ?? settings.updatedAt}</time> · {settings.timezone}</span>
            <span>{t("admin.settings.entireFleet")}</span>
          </p>
        ) : null}
      </header>
      <AdminNavigationTabs />
      <BusinessSettingsWorkspace initial={settings} />
    </div>
  );
}
