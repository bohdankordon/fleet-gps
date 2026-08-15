import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createFleetActivityReportDateNavigation, FLEET_ACTIVITY_REPORT_DATE_FORM, fleetActivityReportDateHref } from "./fleet-activity-report-navigation";

test("report date navigation uses Kyiv dates in canonical report URLs", () => {
  const navigation = createFleetActivityReportDateNavigation(new Date("2026-08-11T22:30:00Z"));
  assert.deepEqual(navigation, { todayHref: "/reports?date=2026-08-12", yesterdayHref: "/reports?date=2026-08-11" });
  assert.equal(fleetActivityReportDateHref("2026-08-10"), "/reports?date=2026-08-10");
});

test("native report date form keeps only the date query contract", () => {
  assert.deepEqual(FLEET_ACTIVITY_REPORT_DATE_FORM, { action: "/reports", method: "get", fieldName: "date" });
  const source = readFileSync("src/components/fleet-activity-report-client.tsx", "utf8");
  assert.match(source, /<form className="report-custom-date" action=\{FLEET_ACTIVITY_REPORT_DATE_FORM\.action\} method=\{FLEET_ACTIVITY_REPORT_DATE_FORM\.method\}>/);
  assert.match(source, /name=\{FLEET_ACTIVITY_REPORT_DATE_FORM\.fieldName\} defaultValue=\{initialDate\}/);
  assert.doesNotMatch(source, /history\.replaceState|useState|useCallback|fetch\(\`\/api\/reports/);
});
