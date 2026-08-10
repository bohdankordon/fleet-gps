import assert from "node:assert/strict";
import test from "node:test";
import { parseVehicleTrackResponse, VehicleTrackContractError } from "./vehicle-track-contract";
import { trackFixture, trackPoint } from "./vehicle-track-fixture";

test("validates empty, one, many, nullable quality/speed, and coordinate boundaries", () => {
  assert.equal(parseVehicleTrackResponse(trackFixture()).points.length, 0);
  const points = [trackPoint(undefined, { latitude: -90, longitude: -180, valid: false, outdated: true }), trackPoint("2026-08-10T10:00:01.000Z", { latitude: 90, longitude: 180, speedKph: 0, valid: true, outdated: false })];
  assert.deepEqual(parseVehicleTrackResponse(trackFixture(points)).points, points);
});
test("rejects invalid UUID/timestamp/coordinate/speed, unknown fields and inconsistent summary", () => {
  const base = trackFixture([trackPoint()]);
  const cases = [{ ...base, vehicle: { ...base.vehicle, id: "bad" } }, { ...base, points: [{ ...base.points[0]!, observedAt: "bad" }] }, { ...base, points: [{ ...base.points[0]!, latitude: 91 }] }, { ...base, points: [{ ...base.points[0]!, speedKph: -1 }] }, { ...base, secret: "x" }, { ...base, summary: { ...base.summary, pointCount: 0 } }];
  for (const value of cases) assert.throws(() => parseVehicleTrackResponse(value), VehicleTrackContractError);
});
