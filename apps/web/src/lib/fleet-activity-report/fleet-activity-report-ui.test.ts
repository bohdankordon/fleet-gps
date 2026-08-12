import assert from "node:assert/strict";
import test from "node:test";
import { fleetActivityReportFixture } from "./fleet-activity-report-fixture";
test("vehicle drill-down preserves the exact report range in the existing Trips URL", () => { const report = fleetActivityReportFixture(); const vehicle = report.vehicles[0]!; const href = `/vehicles/${vehicle.vehicleId}/trips?${new URLSearchParams({ from: report.from, to: report.to })}`; const parsed = new URL(href, "http://web.test"); assert.equal(parsed.pathname, `/vehicles/${vehicle.vehicleId}/trips`); assert.equal(parsed.searchParams.get("from"), report.from); assert.equal(parsed.searchParams.get("to"), report.to); });
