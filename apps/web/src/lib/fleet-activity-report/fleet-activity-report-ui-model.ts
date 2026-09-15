import { hasPermission, type AuthUser } from "../auth/auth-contract";
import type { FleetActivityReportResponse, FleetActivityVehicleRow } from "./fleet-activity-report-contract";

export type ReportGpsFilter = "ALL" | "WITH_GPS" | "NO_GPS";
export const REPORT_UNGROUPED_FILTER = "ungrouped";
export type ReportSort = "distance" | "name" | "trips" | "tripTime" | "stops" | "stopTime" | "gaps";
export type ReportFilters = Readonly<{ search: string; gps: ReportGpsFilter; group: string; sort: ReportSort; direction?: "ascend" | "descend" }>;
export const DEFAULT_REPORT_FILTERS: ReportFilters = Object.freeze({ search: "", gps: "ALL", group: "ALL", sort: "distance", direction: "descend" });
export const REPORT_SORTS: readonly ReportSort[] = ["distance", "name", "trips", "tripTime", "stops", "stopTime", "gaps"];

export function reportSortDirection(state: Pick<ReportFilters, "sort" | "direction">): "ascend" | "descend" {
  return state.direction ?? (state.sort === "name" ? "ascend" : "descend");
}

/** Distance DESC is the default, never an unmarked unsorted state. */
export function nextReportSort(state: Pick<ReportFilters, "sort" | "direction">, key: ReportSort = state.sort): Pick<ReportFilters, "sort" | "direction"> {
  // AntD clears columnKey on the third click; that still advances the active column.
  const first = key === "name" ? "ascend" : "descend";
  if (key !== state.sort) return { sort: key, direction: first };
  if (key === "distance") return { sort: key, direction: reportSortDirection(state) === "descend" ? "ascend" : "descend" };
  return reportSortDirection(state) === first
    ? { sort: key, direction: first === "ascend" ? "descend" : "ascend" }
    : { sort: "distance", direction: "descend" };
}

// These are local view controls over the complete response. They never change
// server summary scope or recompute analytical metrics.
export function reportFilterCount(filters: ReportFilters): number {
  return Number(filters.search.trim().length > 0) + Number(filters.gps !== "ALL") + Number(filters.group !== "ALL");
}
export function reportControlsChanged(filters: ReportFilters): boolean {
  return reportFilterCount(filters) > 0 || filters.sort !== "distance" || reportSortDirection(filters) !== "descend";
}
export function visibleReportVehicles(rows: readonly FleetActivityVehicleRow[], filters: ReportFilters, locale: string): FleetActivityVehicleRow[] {
  const needle = filters.search.trim().normalize("NFKC").toLocaleLowerCase(locale);
  const result = rows.filter((row) => (!needle || row.vehicleName.normalize("NFKC").toLocaleLowerCase(locale).includes(needle)) &&
    (filters.gps === "ALL" || row.hasGpsData === (filters.gps === "WITH_GPS")) &&
    (filters.group === "ALL" || (filters.group === REPORT_UNGROUPED_FILTER ? row.group === null : row.group?.id === filters.group)));
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: "base" });
  const metric = { distance: "observedDistanceMeters", trips: "tripCount", tripTime: "tripDurationSeconds", stops: "stopCount", stopTime: "stopDurationSeconds", gaps: "gapCount" } as const;
  const direction = reportSortDirection(filters) === "ascend" ? 1 : -1;
  return result.sort((a, b) => {
    if (filters.sort === "name") return direction * collator.compare(a.vehicleName, b.vehicleName) || a.vehicleId.localeCompare(b.vehicleId);
    return Number(b.hasGpsData) - Number(a.hasGpsData) || direction * (a[metric[filters.sort]] - b[metric[filters.sort]]) || a.vehicleId.localeCompare(b.vehicleId);
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
