import assert from "node:assert/strict";
import test from "node:test";
import { FleetActivityReportContractError, parseFleetActivityReport } from "./fleet-activity-report-contract";
import { fleetActivityReportFixture } from "./fleet-activity-report-fixture";
test("accepts safe fleet metrics and excludes provider identity", () => { const value = parseFleetActivityReport(fleetActivityReportFixture()); assert.equal(value.vehicles.length, 2); assert.equal("externalDeviceId" in value.vehicles[0]!, false); });
test("rejects unexpected provider fields and false no-GPS semantics", () => { const fixture = fleetActivityReportFixture(); assert.throws(() => parseFleetActivityReport({ ...fixture, vehicles: [{ ...fixture.vehicles[0], externalDeviceId: 7 }, fixture.vehicles[1]] }), FleetActivityReportContractError); assert.throws(() => parseFleetActivityReport({ ...fixture, vehicles: [{ ...fixture.vehicles[0], hasGpsData: false }, fixture.vehicles[1]] }), FleetActivityReportContractError); });
