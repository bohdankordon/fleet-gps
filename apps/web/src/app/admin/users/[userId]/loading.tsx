"use client";

import Link from "next/link";
import { Spin } from "antd";
import { AdminNavigationTabs } from "@/components/admin-navigation-tabs";
import { useI18n } from "@/i18n/client";

export default function AdminUserLoading() {
  const { t } = useI18n();
  return <div className="admin-user-detail-page-v2" role="status" aria-live="polite">
    <Link className="admin-user-detail-v2__back" href="/admin/users"><span aria-hidden="true">{"← "}</span>{t("admin.user.detail.backToUsers")}</Link>
    <AdminNavigationTabs />
    <Spin description={t("common.loading")}><div /></Spin>
  </div>;
}
