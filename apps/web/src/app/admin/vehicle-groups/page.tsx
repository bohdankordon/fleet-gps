import { redirect } from "next/navigation";
import { AdminNavigationTabs } from "@/components/admin-navigation-tabs";
import { VehicleGroupsPageHeader, VehicleGroupsWorkspace } from "@/components/vehicle-groups-workspace";
import { requireAuthUser } from "@/lib/auth/auth-user";
import { fetchManagedVehicles, fetchVehicleGroups } from "@/lib/vehicle-groups/vehicle-groups-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminVehicleGroupsPage() {
  const actor = await requireAuthUser();
  if (actor.role !== "ADMIN") redirect("/forbidden");
  let groups = null;
  let vehicles = null;
  try {
    [groups, vehicles] = await Promise.all([fetchVehicleGroups(), fetchManagedVehicles()]);
  } catch {}
  return <div className="vehicle-groups-page">
    <VehicleGroupsPageHeader />
    <AdminNavigationTabs />
    <VehicleGroupsWorkspace groups={groups} vehicles={vehicles} />
  </div>;
}
