import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminNavigationTabs } from "@/components/admin-navigation-tabs";
import { AdminUserCreateForm } from "@/components/admin-user-create-form";
import { getServerI18n } from "@/i18n/server";
import { requireAuthUser } from "@/lib/auth/auth-user";
import { fetchManagedVehicles, fetchVehicleGroups } from "@/lib/vehicle-groups/vehicle-groups-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function NewAdminUserPage() {
  const [actor, { t }] = await Promise.all([requireAuthUser(), getServerI18n()]);
  if (actor.role !== "ADMIN") redirect("/forbidden");
  let groups = null;
  let vehicles = null;
  try {
    [groups, vehicles] = await Promise.all([fetchVehicleGroups(), fetchManagedVehicles()]);
  } catch {}
  return <div className="admin-user-create-page-v2">
    <header className="admin-user-create-page-v2__header">
      <Link className="admin-user-create-v2__back" href="/admin/users"><span aria-hidden="true">{"← "}</span>{t("admin.user.detail.backToUsers")}</Link>
      <h1>{t("admin.users.create")}</h1>
      <p className="admin-user-create-page-v2__description">{t("admin.user.create.description")}</p>
    </header>
    <AdminNavigationTabs />
    <AdminUserCreateForm groups={groups} vehicles={vehicles} />
  </div>;
}
