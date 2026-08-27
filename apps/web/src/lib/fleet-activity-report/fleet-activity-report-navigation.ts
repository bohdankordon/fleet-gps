import { currentBusinessDate, previousBusinessDate } from "./fleet-activity-report-date";

export const FLEET_ACTIVITY_REPORT_DATE_FORM = Object.freeze({ action: "/reports", method: "get", fieldName: "date" as const });

export function fleetActivityReportDateHref(date: string): string {
  return `${FLEET_ACTIVITY_REPORT_DATE_FORM.action}?${new URLSearchParams({ [FLEET_ACTIVITY_REPORT_DATE_FORM.fieldName]: date })}`;
}

export function createFleetActivityReportDateNavigation(now: Date, timezone: string): Readonly<{ todayHref: string; yesterdayHref: string }> | null {
  const today = currentBusinessDate(now, timezone);
  const yesterday = previousBusinessDate(now, timezone);
  return today && yesterday ? Object.freeze({ todayHref: fleetActivityReportDateHref(today), yesterdayHref: fleetActivityReportDateHref(yesterday) }) : null;
}
