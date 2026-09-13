import Link from "next/link";
import { AdminNavigationTabs } from "@/components/admin-navigation-tabs";
import { AuxiliaryState } from "@/components/auxiliary-state";
import { getServerI18n } from "@/i18n/server";

export default async function AdminUserNotFound() {
  const { t } = await getServerI18n();
  return <div className="admin-user-detail-page-v2">
    <Link className="admin-user-detail-v2__back" href="/admin/users"><span aria-hidden="true">{"← "}</span>{t("admin.user.detail.backToUsers")}</Link>
    <AdminNavigationTabs />
    <AuxiliaryState title={t("admin.user.detail.notFound")} description={t("admin.user.detail.notFoundText")} />
  </div>;
}
