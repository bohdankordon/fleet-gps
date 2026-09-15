"use client";

import { AdminNavigationTabs } from "@/components/admin-navigation-tabs";
import { useI18n } from "@/i18n/client";

export default function AdminVehicleGroupLoading() {
  const { t } = useI18n();
  return <div className="vehicle-groups-detail-page"><AdminNavigationTabs /><p aria-live="polite">{t("admin.groups.loading")}</p></div>;
}
