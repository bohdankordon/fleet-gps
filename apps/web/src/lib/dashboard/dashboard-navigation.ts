import { serializeDashboardQuery, type DashboardQuery } from "./dashboard-query";
export type DashboardNavigationReason = "user" | "popstate" | "refresh" | "retry";
export function shouldUpdateDashboardHistory(reason: DashboardNavigationReason): boolean { return reason === "user"; }
export function dashboardHistoryPath(query: DashboardQuery): string { const encoded = serializeDashboardQuery(query); return encoded ? `/?${encoded}` : "/"; }
