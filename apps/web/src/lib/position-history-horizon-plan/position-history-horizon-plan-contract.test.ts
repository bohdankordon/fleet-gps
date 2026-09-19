import assert from "node:assert/strict";
import test from "node:test";
import { parsePositionHistoryHorizonPlan, PositionHistoryHorizonPlanContractError } from "./position-history-horizon-plan-contract";
import { positionHistoryHorizonPlanFixture } from "./position-history-horizon-plan-fixture";

test("accepts the manual planning DTO without observation aggregates or vehicle/provider rows", () => {
  assert.deepEqual(parsePositionHistoryHorizonPlan(positionHistoryHorizonPlanFixture()), positionHistoryHorizonPlanFixture());
});

test("rejects inconsistent planning counts, extra sensitive-looking fields, and any stored-observation block", () => {
  const fixture = positionHistoryHorizonPlanFixture();
  for (const value of [
    { ...fixture, fleet: { ...fixture.fleet, providerDisabled: 2 } },
    { ...fixture, slices: { ...fixture.slices, total: 3 } },
    { ...fixture, externalDeviceId: "secret" },
    { ...fixture, observations: { rowCount: 42, vehiclesWithObservations: 2, vehiclesWithoutObservations: 1, firstObservationAt: null, lastObservationAt: null } },
    { ...fixture, gpsCompletenessPercentage: 87 },
  ]) assert.throws(() => parsePositionHistoryHorizonPlan(value), PositionHistoryHorizonPlanContractError);
});
