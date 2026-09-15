import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminNavigationTabs } from "@/components/admin-navigation-tabs";
import { VehicleGroupDetailWorkspace } from "@/components/vehicle-group-detail-workspace";
import { Alert } from "@/components/ui";
import { getServerI18n } from "@/i18n/server";
import { requireAuthUser } from "@/lib/auth/auth-user";
import { fetchManagedVehicles, fetchVehicleGroup, fetchVehicleGroups } from "@/lib/vehicle-groups/vehicle-groups-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminVehicleGroupPage({ params }: Readonly<{ params: Promise<{ groupId: string }> }>) {
  const [actor, { t }] = await Promise.all([requireAuthUser(), getServerI18n()]);
  if (actor.role !== "ADMIN") redirect("/forbidden");
  const { groupId } = await params;
  let group;
  let vehicles = null;
  let groups = null;
  try {
    [group, vehicles, groups] = await Promise.all([fetchVehicleGroup(groupId), fetchManagedVehicles(), fetchVehicleGroups()]);
  } catch {
    return <div className="vehicle-groups-detail-page">
      <Link className="vehicle-groups-detail__back" href="/admin/vehicle-groups"><span aria-hidden="true">{"← "}</span>{t("admin.groups.backToGroups")}</Link>
      <AdminNavigationTabs />
      <Alert variant="danger" live="assertive" title={t("admin.groups.unavailable")} action={<Link href={`/admin/vehicle-groups/${encodeURIComponent(groupId)}`}>{t("common.retry")}</Link>} />
    </div>;
  }
  if (!group || !vehicles || !groups) notFound();
  return <div className="vehicle-groups-detail-page"><AdminNavigationTabs /><VehicleGroupDetailWorkspace group={group} vehicles={vehicles} groups={groups} /></div>;
}
