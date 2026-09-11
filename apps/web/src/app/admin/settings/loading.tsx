import { Spin } from "antd";
import { AdminNavigationTabs } from "@/components/admin-navigation-tabs";
import { getServerI18n } from "@/i18n/server";

export default async function AdminSettingsLoading() {
  const { t } = await getServerI18n();
  return (
    <div className="business-settings-page">
      <header className="business-settings-header">
        <h1>{t("admin.settings.title")}</h1>
        <p>{t("admin.settings.tagline")}</p>
      </header>
      <AdminNavigationTabs />
      <div className="business-settings__loading" role="status" aria-live="polite">
        <Spin size="large" />
      </div>
    </div>
  );
}
