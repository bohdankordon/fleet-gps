import { parseGroupFilterParam } from "../vehicle-access/vehicle-access.service";
import type { GroupFilter } from "../vehicle-access/vehicle-access.types";

export type DashboardStatusFilter = "online" | "offline" | "unknown";
export type DashboardActivityFilter = "below_threshold" | "normal" | "no_data";
export type DashboardQueryParams = Readonly<{ search: string | undefined; status: DashboardStatusFilter | undefined; activity: DashboardActivityFilter | undefined; includeDisabled: boolean; group: GroupFilter }>;

export class DashboardQueryParamsError extends Error { public constructor() { super("Invalid dashboard query."); this.name = "DashboardQueryParamsError"; } }

export function parseDashboardQueryParams(query: Readonly<Record<string, unknown>>): DashboardQueryParams {
  const rawSearch = query.search;
  if (rawSearch !== undefined && typeof rawSearch !== "string") throw new DashboardQueryParamsError();
  const search = rawSearch?.trim() || undefined;
  if (search !== undefined && search.length > 100) throw new DashboardQueryParamsError();
  const rawStatus = query.status;
  if (rawStatus !== undefined && rawStatus !== "online" && rawStatus !== "offline" && rawStatus !== "unknown") throw new DashboardQueryParamsError();
  const rawActivity = query.activity;
  if (rawActivity !== undefined && rawActivity !== "below_threshold" && rawActivity !== "normal" && rawActivity !== "no_data") throw new DashboardQueryParamsError();
  const rawDisabled = query.includeDisabled;
  if (rawDisabled !== undefined && rawDisabled !== "true" && rawDisabled !== "false") throw new DashboardQueryParamsError();
  const group = parseGroupFilterParam(query.group);
  if (!group) throw new DashboardQueryParamsError();
  return Object.freeze({ search, status: rawStatus, activity: rawActivity, includeDisabled: rawDisabled === undefined ? true : rawDisabled === "true", group });
}
