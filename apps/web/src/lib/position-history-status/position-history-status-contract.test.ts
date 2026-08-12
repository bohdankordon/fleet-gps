import assert from "node:assert/strict";
import test from "node:test";
import { parsePositionHistoryStatus, PositionHistoryStatusContractError } from "./position-history-status-contract";
import { positionHistoryStatusFixture } from "./position-history-status-fixture";

test("accepts the safe aggregate DTO without vehicle/provider/coordinate rows", () => { assert.deepEqual(parsePositionHistoryStatus(positionHistoryStatusFixture()), positionHistoryStatusFixture()); });
test("rejects inconsistent counts, extra sensitive-looking fields, and invented completeness metrics", () => {
  const fixture = positionHistoryStatusFixture();
  for (const value of [{ ...fixture, fleet: { ...fixture.fleet, providerDisabled: 2 } }, { ...fixture, externalDeviceId: "secret" }, { ...fixture, gpsCompletenessPercentage: 87 }]) assert.throws(() => parsePositionHistoryStatus(value), PositionHistoryStatusContractError);
});
