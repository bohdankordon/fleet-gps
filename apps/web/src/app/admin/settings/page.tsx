import { redirect } from "next/navigation";
import { AdminSettingsForm } from "@/components/admin-settings-form";
import { AdminNavigationTabs } from "@/components/admin-navigation-tabs";
import { requireAuthUser } from "@/lib/auth/auth-user";
import { fetchAdminSettings } from "@/lib/admin-settings/admin-settings-client";
import { getServerI18n } from "@/i18n/server";
export const dynamic = "force-dynamic"; export const revalidate = 0;
export default async function AdminSettingsPage() {
  const [user, { t }] = await Promise.all([requireAuthUser(), getServerI18n()]); if (user.role !== "ADMIN") redirect("/forbidden"); let settings = null;
  try { settings = await fetchAdminSettings(); } catch {}
  return <div><header className="hero"><div><p className="eyebrow">{t("admin.settings.eyebrow")}</p><h1>{t("admin.settings.title")}</h1><p>{t("admin.settings.description")}</p></div></header><AdminNavigationTabs />{settings ? <AdminSettingsForm initial={settings} /> : <p className="admin-error" role="alert">{t("admin.settings.loadError")}</p>}</div>;
}
