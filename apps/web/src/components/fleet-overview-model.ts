import type { DashboardVehiclesResponse } from "@/lib/dashboard/dashboard-contract";

export type FleetSort = "name" | "freshness" | "speed";
type FleetVehicle = DashboardVehiclesResponse["vehicles"][number];

const freshnessOrder: Readonly<Record<FleetVehicle["positionFreshness"], number>> = Object.freeze({ stale: 0, missing: 1, future: 2, fresh: 3 });

/** Sorting is intentionally local: filtering and authorization remain server-owned. */
export function sortFleetVehicles(vehicles: readonly FleetVehicle[], sort: FleetSort, locale: string): FleetVehicle[] {
  return [...vehicles].sort((left, right) => {
    if (sort === "name") return left.name.localeCompare(right.name, locale, { sensitivity: "base" });
    if (sort === "freshness") return freshnessOrder[left.positionFreshness] - freshnessOrder[right.positionFreshness] || left.name.localeCompare(right.name, locale);
    return (right.speedKph ?? -1) - (left.speedKph ?? -1) || left.name.localeCompare(right.name, locale);
  });
}
