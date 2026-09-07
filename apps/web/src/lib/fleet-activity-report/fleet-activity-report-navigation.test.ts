import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createFleetActivityReportDateNavigation, fleetActivityReportDateHref } from "./fleet-activity-report-navigation";
test("report date navigation uses supplied business-timezone dates in canonical report URLs", () => {
  assert.deepEqual(createFleetActivityReportDateNavigation(new Date("2026-08-11T22:30:00Z"), "Europe/Kyiv"), { todayHref: "/reports?date=2026-08-12", yesterdayHref: "/reports?date=2026-08-11" });
  assert.equal(fleetActivityReportDateHref("2026-08-10"), "/reports?date=2026-08-10");
});
test("server navigation keeps only the date URL and refresh does not add history", () => {
  const source = readFileSync("src/components/report-navigation.tsx", "utf8");
  assert.match(source, /router.refresh\(\)/);
  assert.match(source, /router.push\(fleetActivityReportDateHref\(date\), \{ scroll: false \}\)/);
  assert.match(source, /useTransition/);
  assert.doesNotMatch(source, /replaceState|from:|to:|setInterval/);
});
