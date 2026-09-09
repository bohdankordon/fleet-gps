import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminNavigationTabs } from "@/components/admin-navigation-tabs";
import { AdminUserDetail } from "@/components/admin-user-detail";
import { Alert } from "@/components/ui";
import { getServerI18n } from "@/i18n/server";
import { fetchAdminUser } from "@/lib/admin-users/admin-users-client";
import { requireAuthUser } from "@/lib/auth/auth-user";
export const dynamic = "force-dynamic"; export const revalidate = 0;
export default async function AdminUserPage({ params }: Readonly<{ params: Promise<{ userId: string }> }>) {
  const [actor, { t }] = await Promise.all([requireAuthUser(), getServerI18n()]);
  if (actor.role !== "ADMIN") redirect("/forbidden");
  const { userId } = await params;
  let user;
  try {
    user = await fetchAdminUser(userId);
  } catch {
    return <div className="admin-user-detail-page-v2">
      <Link className="admin-user-detail-v2__back" href="/admin/users"><span aria-hidden="true">{"← "}</span>{t("admin.user.detail.backToUsers")}</Link>
      <AdminNavigationTabs />
      <Alert variant="danger" live="assertive" title={t("admin.user.detail.unavailable")} action={<Link href={`/admin/users/${encodeURIComponent(userId)}`}>{t("common.retry")}</Link>} />
    </div>;
  }
  if (!user) notFound();
  return <div className="admin-user-detail-page-v2"><AdminUserDetail initialUser={user} actorId={actor.id} /></div>;
}
