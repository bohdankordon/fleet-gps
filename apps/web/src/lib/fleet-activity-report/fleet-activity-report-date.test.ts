import assert from "node:assert/strict";
import test from "node:test";
import { resolveFleetActivityReportDateRange, resolveInitialFleetActivityReportDate } from "./fleet-activity-report-date";
const KYIV = "Europe/Kyiv";
test("Today is the supplied business-timezone start-of-day through the injected current instant", () => { const now = new Date("2026-08-12T10:30:00Z"); assert.deepEqual(resolveFleetActivityReportDateRange("2026-08-12", now, KYIV), { from: "2026-08-11T21:00:00.000Z", to: now.toISOString() }); assert.equal(resolveInitialFleetActivityReportDate({ date: "2026-08-12" }, now, KYIV)?.defaulted, false); });
test("historical business calendar days preserve supplied-zone DST durations", () => { const now = new Date("2026-11-01T12:00:00Z"); const spring = resolveFleetActivityReportDateRange("2026-03-29", now, KYIV)!; const fall = resolveFleetActivityReportDateRange("2026-10-25", now, KYIV)!; assert.equal(Date.parse(spring.to) - Date.parse(spring.from), 23 * 3_600_000); assert.equal(Date.parse(fall.to) - Date.parse(fall.from), 25 * 3_600_000); });
test("valid URL dates survive while malformed values fall back to supplied-zone Today", () => { const now = new Date("2026-08-12T10:30:00Z"); assert.equal(resolveInitialFleetActivityReportDate({ date: "2026-08-10" }, now, KYIV)?.date, "2026-08-10"); for (const date of ["bad", "2026-02-30", ["2026-08-10"]]) { const resolved = resolveInitialFleetActivityReportDate({ date }, now, KYIV)!; assert.equal(resolved.date, "2026-08-12"); assert.equal(resolved.defaulted, true); } });
test("a supplied timezone changes the default business service date at a boundary", () => { const now = new Date("2026-08-12T22:30:00Z"); assert.equal(resolveInitialFleetActivityReportDate({}, now, "Europe/Kyiv")?.date, "2026-08-13"); assert.equal(resolveInitialFleetActivityReportDate({}, now, "America/New_York")?.date, "2026-08-12"); });


test("exact Kyiv midnight Today is a valid empty half-open interval", () => {
  const now = new Date("2026-09-06T21:00:00.000Z");
  assert.deepEqual(resolveFleetActivityReportDateRange("2026-09-07", now, KYIV), { from: now.toISOString(), to: now.toISOString() });
});
