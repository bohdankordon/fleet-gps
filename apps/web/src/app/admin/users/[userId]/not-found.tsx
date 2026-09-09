import Link from "next/link";
import { EmptyState } from "@/components/ui";
import { getServerI18n } from "@/i18n/server";

export default async function AdminUserNotFound() {
  const { t } = await getServerI18n();
  return <div className="admin-user-detail-page-v2">
    <EmptyState title={t("admin.user.detail.notFound")} action={<Link className="admin-user-detail-v2__back" href="/admin/users"><span aria-hidden="true">{"← "}</span>{t("admin.user.detail.backToUsers")}</Link>} />
  </div>;
}
