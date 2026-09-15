"use client";

import { AdminNavigationTabs } from "@/components/admin-navigation-tabs";
import { VehicleGroupsLoadingWorkspace, VehicleGroupsPageHeader } from "@/components/vehicle-groups-workspace";

export default function AdminVehicleGroupsLoading() {
  return <div className="vehicle-groups-page"><VehicleGroupsPageHeader /><AdminNavigationTabs /><VehicleGroupsLoadingWorkspace /></div>;
}
