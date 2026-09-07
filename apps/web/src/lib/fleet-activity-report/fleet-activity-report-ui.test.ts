import assert from "node:assert/strict";
import test from "node:test";
import { fleetActivityReportFixture } from "./fleet-activity-report-fixture";
import { DEFAULT_REPORT_FILTERS, reportControlsChanged, reportFilterCount, reportVehicleActions, visibleReportVehicles, REPORT_SORTS } from "./fleet-activity-report-ui-model";
import type { AuthUser } from "../auth/auth-contract";
const report = fleetActivityReportFixture();
const user: AuthUser = { id: "u", login: "u", role: "USER", permissions: ["reports.view"], mustChangePassword: false };
test("search and GPS filter compose without modifying fleet-wide summary or source order", () => {
  const before = JSON.stringify(report);
  assert.equal(visibleReportVehicles(report.vehicles, { ...DEFAULT_REPORT_FILTERS, search: "taxi a" }, "en").length, 1);
  assert.equal(visibleReportVehicles(report.vehicles, { ...DEFAULT_REPORT_FILTERS, gps: "NO_GPS" }, "en")[0]!.hasGpsData, false);
  assert.equal(visibleReportVehicles(report.vehicles, { ...DEFAULT_REPORT_FILTERS, gps: "WITH_GPS", search: "taxi b" }, "en").length, 0);
  assert.equal(JSON.stringify(report), before);
  assert.equal(reportFilterCount({ ...DEFAULT_REPORT_FILTERS, search: " a ", gps: "WITH_GPS" }), 2);
  assert.equal(reportFilterCount({ ...DEFAULT_REPORT_FILTERS, sort: "name" }), 0);
  assert.equal(reportControlsChanged(DEFAULT_REPORT_FILTERS), false);
  assert.equal(reportControlsChanged({ ...DEFAULT_REPORT_FILTERS, sort: "name" }), true);
});
test("all factual sorts are deterministic, no-GPS remains last in metric sorts and reset restores distance", () => {
  const observedZero = { ...report.vehicles[0]!, vehicleId: "00000000-0000-4000-8000-000000000003", vehicleName: "AAA", observedDistanceMeters: 0, tripCount: 0, tripDurationSeconds: 0, stopCount: 0, gapCount: 0 };
  const rows = [report.vehicles[1]!, observedZero, report.vehicles[0]!];
  for (const sort of REPORT_SORTS) {
    const sorted = visibleReportVehicles(rows, { ...DEFAULT_REPORT_FILTERS, sort }, "en");
    assert.equal(sorted[0]!.vehicleId, sort === "name" ? observedZero.vehicleId : report.vehicles[0]!.vehicleId);
  }
  assert.equal(visibleReportVehicles([observedZero, { ...observedZero, vehicleId: report.vehicles[0]!.vehicleId }], DEFAULT_REPORT_FILTERS, "en")[0]!.vehicleId, report.vehicles[0]!.vehicleId);
});
test("each investigation action requires its own permission and carries exact report context", () => {
  const id = report.vehicles[0]!.vehicleId;
  assert.deepEqual(reportVehicleActions(id, report, user), []);
  for (const [permission, keys] of [["vehicles.view", ["vehicle"]], ["trips.view", ["trips", "history"]], ["map.view", ["position"]]] as const) {
    const actions = reportVehicleActions(id, report, { ...user, permissions: [permission] });
    assert.deepEqual(actions.map((a) => a.key), keys);
    for (const a of actions.filter((a) => a.key === "trips" || a.key === "history")) {
      const url = new URL(a.href, "http://web.test");
      assert.equal(url.searchParams.get("from"), report.from); assert.equal(url.searchParams.get("to"), report.to);
    }
  }
  assert.deepEqual(reportVehicleActions(id, report, { ...user, role: "ADMIN" }).map((a) => a.key), ["vehicle", "trips", "history", "position"]);
  assert.ok(reportVehicleActions(id, { ...report, to: report.from }, { ...user, permissions: ["trips.view"] }).every((a) => a.disabled));
});
