import assert from "node:assert/strict";
import test from "node:test";
import { classifySpeedLimitZone } from "./city-geofence.policy";

test("maps geometry classification to the conservative speed zone policy", () => {
  assert.equal(classifySpeedLimitZone("INSIDE"), "CITY");
  assert.equal(classifySpeedLimitZone("BOUNDARY"), "CITY");
  assert.equal(classifySpeedLimitZone("OUTSIDE"), "OUTSIDE_CITY");
  assert.equal(classifySpeedLimitZone("UNCONFIGURED"), "UNKNOWN");
  assert.equal(classifySpeedLimitZone("INVALID_POINT"), "UNKNOWN");
});
