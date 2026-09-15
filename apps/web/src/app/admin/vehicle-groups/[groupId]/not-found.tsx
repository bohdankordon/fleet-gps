import Link from "next/link";
import { AdminNavigationTabs } from "@/components/admin-navigation-tabs";
import { AuxiliaryState } from "@/components/auxiliary-state";
import { getServerI18n } from "@/i18n/server";

export default async function AdminVehicleGroupNotFound() {
  const { t } = await getServerI18n();
  return <div className="vehicle-groups-detail-page">
    <Link className="vehicle-groups-detail__back" href="/admin/vehicle-groups"><span aria-hidden="true">{"← "}</span>{t("admin.groups.backToGroups")}</Link>
    <AdminNavigationTabs />
    <AuxiliaryState title={t("admin.groups.notFound")} description={t("admin.groups.notFoundText")} />
  </div>;
}
