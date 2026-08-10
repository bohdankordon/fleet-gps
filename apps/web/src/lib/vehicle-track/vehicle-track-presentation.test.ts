import assert from "node:assert/strict";
import test from "node:test";
import { trackFixture, trackPoint } from "./vehicle-track-fixture";
import { buildVehicleTrackPresentation, VehicleTrackPresentationError } from "./vehicle-track-presentation";

test("builds empty and single-point models with bounds and one single endpoint", () => {
  assert.deepEqual(buildVehicleTrackPresentation(trackFixture()).bounds, null);
  const model = buildVehicleTrackPresentation(trackFixture([trackPoint()]));
  assert.deepEqual(model.bounds, [[28.4, 49.2], [28.4, 49.2]]); assert.equal(model.start?.endpoint, "single"); assert.equal(model.end?.key, model.start?.key); assert.equal(model.lineGeoJson.features.length, 0);
});
test("connects 300 seconds, breaks 301 seconds, counts multiple gaps and preserves same-time points", () => {
  const points = [trackPoint("2026-08-10T10:00:00Z"), trackPoint("2026-08-10T10:00:00Z", { longitude: 28.41 }), trackPoint("2026-08-10T10:05:00Z", { longitude: 28.42 }), trackPoint("2026-08-10T10:10:01Z", { longitude: 28.43 }), trackPoint("2026-08-10T10:20:02Z", { longitude: 28.44 })];
  const model = buildVehicleTrackPresentation(trackFixture(points));
  assert.equal(model.points.length, 5); assert.equal(model.gapCount, 2); assert.equal(model.lineGeoJson.features.length, 1); assert.equal(model.lineGeoJson.features[0]!.geometry.coordinates.length, 3); assert.equal(model.start?.endpoint, "start"); assert.equal(model.end?.endpoint, "end"); assert.deepEqual(model.bounds, [[28.4, 49.2], [28.44, 49.2]]);
});
test("detects quality warnings and rejects out-of-order input instead of sorting", () => {
  const model = buildVehicleTrackPresentation(trackFixture([trackPoint(undefined, { valid: false }), trackPoint("2026-08-10T10:00:01Z", { outdated: true }), trackPoint("2026-08-10T10:00:02Z")]));
  assert.deepEqual(model.points.map((point) => point.qualityWarning), [true, true, false]);
  assert.throws(() => buildVehicleTrackPresentation(trackFixture([trackPoint("2026-08-10T10:00:01Z"), trackPoint("2026-08-10T10:00:00Z")])), VehicleTrackPresentationError);
});
