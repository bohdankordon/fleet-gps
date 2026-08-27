import { getServerI18n } from "@/i18n/server";

export default async function AdminSettingsLoading() {
  const { t } = await getServerI18n();
  return <p role="status">{t("common.loading")}</p>;
}
