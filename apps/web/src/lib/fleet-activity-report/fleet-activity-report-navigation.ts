import { currentKyivDate, previousKyivDate } from "./fleet-activity-report-date";

export const FLEET_ACTIVITY_REPORT_DATE_FORM = Object.freeze({ action: "/reports", method: "get", fieldName: "date" as const });

export function fleetActivityReportDateHref(date: string): string {
  return `${FLEET_ACTIVITY_REPORT_DATE_FORM.action}?${new URLSearchParams({ [FLEET_ACTIVITY_REPORT_DATE_FORM.fieldName]: date })}`;
}

export function createFleetActivityReportDateNavigation(now: Date): Readonly<{ todayHref: string; yesterdayHref: string }> | null {
  const today = currentKyivDate(now);
  const yesterday = previousKyivDate(now);
  return today && yesterday ? Object.freeze({ todayHref: fleetActivityReportDateHref(today), yesterdayHref: fleetActivityReportDateHref(yesterday) }) : null;
}
