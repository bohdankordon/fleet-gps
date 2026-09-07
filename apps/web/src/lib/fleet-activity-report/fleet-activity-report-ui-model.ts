import { hasPermission, type AuthUser } from "../auth/auth-contract";
import type { FleetActivityReportResponse, FleetActivityVehicleRow } from "./fleet-activity-report-contract";

export type ReportGpsFilter = "ALL" | "WITH_GPS" | "NO_GPS";
export type ReportSort = "distance" | "name" | "trips" | "tripTime" | "stops" | "gaps";
export type ReportFilters = Readonly<{ search: string; gps: ReportGpsFilter; sort: ReportSort }>;
export const DEFAULT_REPORT_FILTERS: ReportFilters = Object.freeze({ search: "", gps: "ALL", sort: "distance" });
export const REPORT_SORTS: readonly ReportSort[] = ["distance", "name", "trips", "tripTime", "stops", "gaps"];

// These are local view controls over the complete response. They never change
// server summary scope or recompute analytical metrics.
export function reportFilterCount(filters: ReportFilters): number {
  return Number(filters.search.trim().length > 0) + Number(filters.gps !== "ALL");
}
export function reportControlsChanged(filters: ReportFilters): boolean {
  return reportFilterCount(filters) > 0 || filters.sort !== "distance";
}
export function visibleReportVehicles(rows: readonly FleetActivityVehicleRow[], filters: ReportFilters, locale: string): FleetActivityVehicleRow[] {
  const needle = filters.search.trim().normalize("NFKC").toLocaleLowerCase(locale);
  const result = rows.filter((row) => (!needle || row.vehicleName.normalize("NFKC").toLocaleLowerCase(locale).includes(needle)) &&
    (filters.gps === "ALL" || row.hasGpsData === (filters.gps === "WITH_GPS")));
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: "base" });
  const metric = { distance: "observedDistanceMeters", trips: "tripCount", tripTime: "tripDurationSeconds", stops: "stopCount", gaps: "gapCount" } as const;
  return result.sort((a, b) => {
    if (filters.sort === "name") return collator.compare(a.vehicleName, b.vehicleName) || a.vehicleId.localeCompare(b.vehicleId);
    return Number(b.hasGpsData) - Number(a.hasGpsData) || b[metric[filters.sort]] - a[metric[filters.sort]] || a.vehicleId.localeCompare(b.vehicleId);
  });
}

export type ReportAction = Readonly<{ key: "vehicle" | "trips" | "history" | "position"; href: string; disabled: boolean }>;
export function reportVehicleActions(vehicleId: string, report: Pick<FleetActivityReportResponse, "from" | "to">, user: AuthUser | null): ReportAction[] {
  if (!user) return [];
  const base = `/vehicles/${vehicleId}`;
  const query = new URLSearchParams({ from: report.from, to: report.to });
  const actions: ReportAction[] = [];
  if (hasPermission(user, "vehicles.view")) actions.push({ key: "vehicle", href: base, disabled: false });
  // Trips and History require positive ranges. Never send an empty interval that
  // those pages would reject or silently default to another period.
  if (hasPermission(user, "trips.view")) {
    const disabled = Date.parse(report.from) === Date.parse(report.to);
    actions.push({ key: "trips", href: `${base}/trips?${query}`, disabled }, { key: "history", href: `${base}/track?${query}`, disabled });
  }
  if (hasPermission(user, "map.view")) actions.push({ key: "position", href: `/map?vehicleId=${vehicleId}`, disabled: false });
  return actions;
}
