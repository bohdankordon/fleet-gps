export type DashboardStatus = "online" | "offline" | "unknown";
export type DashboardActivity = "below_threshold" | "normal" | "no_data";
export type DashboardQuery = Readonly<{ search?: string; status?: DashboardStatus; activity?: DashboardActivity; includeDisabled?: boolean }>;
export class DashboardQueryError extends Error { public constructor() { super("Invalid dashboard filters."); this.name = "DashboardQueryError"; } }
const allowed = new Set(["search", "status", "activity", "includeDisabled"]);

export function parseDashboardQuery(params: URLSearchParams): DashboardQuery {
  for (const key of params.keys()) if (!allowed.has(key)) continue;
  const searchValue = params.get("search"); const search = searchValue?.trim() || undefined;
  if (search && search.length > 100) throw new DashboardQueryError();
  const statusValue = params.get("status"); if (statusValue !== null && statusValue !== "online" && statusValue !== "offline" && statusValue !== "unknown") throw new DashboardQueryError();
  const activityValue = params.get("activity"); if (activityValue !== null && activityValue !== "below_threshold" && activityValue !== "normal" && activityValue !== "no_data") throw new DashboardQueryError();
  const disabledValue = params.get("includeDisabled"); if (disabledValue !== null && disabledValue !== "true" && disabledValue !== "false") throw new DashboardQueryError();
  return Object.freeze({ search, status: statusValue ?? undefined, activity: activityValue ?? undefined, includeDisabled: disabledValue === null ? true : disabledValue === "true" });
}
export function serializeDashboardQuery(query: DashboardQuery): string { const params = new URLSearchParams(); if (query.search) params.set("search", query.search); if (query.status) params.set("status", query.status); if (query.activity) params.set("activity", query.activity); if (query.includeDisabled === false) params.set("includeDisabled", "false"); return params.toString(); }
