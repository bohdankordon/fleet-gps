import assert from "node:assert/strict";
import test from "node:test";
import { FleetActivityReportContractError, parseFleetActivityReport } from "./fleet-activity-report-contract";
import { fleetActivityReportFixture } from "./fleet-activity-report-fixture";
test("accepts safe fleet metrics and excludes provider identity", () => { const value = parseFleetActivityReport(fleetActivityReportFixture()); assert.equal(value.vehicles.length, 2); assert.equal("externalDeviceId" in value.vehicles[0]!, false); });
test("rejects unexpected provider fields and false no-GPS semantics", () => { const fixture = fleetActivityReportFixture(); assert.throws(() => parseFleetActivityReport({ ...fixture, vehicles: [{ ...fixture.vehicles[0], externalDeviceId: 7 }, fixture.vehicles[1]] }), FleetActivityReportContractError); assert.throws(() => parseFleetActivityReport({ ...fixture, vehicles: [{ ...fixture.vehicles[0], hasGpsData: false }, fixture.vehicles[1]] }), FleetActivityReportContractError); });


test("strict report context rejects unknown fields, invalid timezone, timestamps and policy", () => {
  const valid = fleetActivityReportFixture();
  for (const invalid of [
    { ...valid, generatedAt: "today" }, { ...valid, timezone: "Not/AZone" },
    { ...valid, provider: {} }, { ...valid, policy: { ...valid.policy, version: 1 } },
    { ...valid, policy: { ...valid.policy, tripStopConfirmationSeconds: -1 } },
  ]) assert.throws(() => parseFleetActivityReport(invalid), FleetActivityReportContractError);
});
test("observation boundaries, gap durations and summary totals must match factual rows", () => {
  const valid = fleetActivityReportFixture();
  for (const change of [
    { firstObservationAt: null }, { lastObservationAt: valid.to },
    { firstObservationAt: valid.to }, { gapDurationSeconds: -1 },
  ]) assert.throws(() => parseFleetActivityReport({ ...valid, vehicles: [{ ...valid.vehicles[0], ...change }, valid.vehicles[1]] }));
  assert.throws(() => parseFleetActivityReport({ ...valid, vehicles: [valid.vehicles[0], { ...valid.vehicles[1], firstObservationAt: valid.from }] }));
  assert.throws(() => parseFleetActivityReport({ ...valid, summary: { ...valid.summary, totalGapDurationSeconds: 1 } }));
});
test("zero-length contract admits identities with no GPS and rejects reversed ranges", () => {
  const valid = fleetActivityReportFixture();
  const empty = { ...valid, to: valid.from, vehicles: [valid.vehicles[1]], summary: { vehicleCount: 1, vehiclesWithGps: 0, vehicleWithoutGpsCount: 1, tripCount: 0, totalObservedDistanceMeters: 0, totalTripDurationSeconds: 0, gapCount: 0, totalGapDurationSeconds: 0 } };
  assert.equal(parseFleetActivityReport(empty).vehicles.length, 1);
  assert.throws(() => parseFleetActivityReport({ ...empty, to: "2020-01-01T00:00:00Z" }));
});
