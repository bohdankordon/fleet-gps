import assert from "node:assert/strict";
import test from "node:test";
import { overviewSegment, overviewTrackFixture, trackPoint } from "./vehicle-track-fixture";
import { buildVehicleTrackOverviewPresentation } from "./vehicle-track-overview-presentation";

test("keeps sampled points twenty minutes apart connected inside one authoritative server segment", () => {
  const response = overviewTrackFixture([overviewSegment([
    trackPoint("2026-08-01T00:00:00Z"),
    trackPoint("2026-08-01T00:20:00Z", { longitude: 28.5 }),
  ], 1_000)]);
  const model = buildVehicleTrackOverviewPresentation(response);
  assert.equal(model.gapCount, 0);
  assert.equal(model.lineGeoJson.features.length, 1);
  assert.equal(model.lineGeoJson.features[0]!.geometry.coordinates.length, 2);
});

test("never joins server-owned segments even when their selected timestamps are close", () => {
  const response = overviewTrackFixture([
    overviewSegment([trackPoint("2026-08-01T00:00:00Z"), trackPoint("2026-08-01T00:00:30Z", { longitude: 28.5 })], 500),
    overviewSegment([trackPoint("2026-08-01T00:01:00Z", { longitude: 28.6 }), trackPoint("2026-08-01T00:21:00Z", { longitude: 28.7 })], 700),
  ], 11);
  const model = buildVehicleTrackOverviewPresentation(response);
  assert.equal(model.lineGeoJson.features.length, 2); assert.equal(model.gapCount, 1);
  assert.deepEqual(model.lineGeoJson.features.map((feature) => feature.geometry.coordinates.length), [2, 2]);
  assert.equal(model.start?.point.observedAt, "2026-08-01T00:00:00Z"); assert.equal(model.end?.point.observedAt, "2026-08-01T00:21:00Z");
  assert.deepEqual(model.points.map((point) => point.qualityWarning), [false, false, false, false]);
});

test("supports empty and one-point overview endpoint semantics", () => {
  assert.equal(buildVehicleTrackOverviewPresentation(overviewTrackFixture()).points.length, 0);
  const model = buildVehicleTrackOverviewPresentation(overviewTrackFixture([overviewSegment([trackPoint("2026-08-01T00:00:00Z", { outdated: true })], 25)], 4));
  assert.equal(model.start?.endpoint, "single"); assert.equal(model.end?.key, model.start?.key); assert.equal(model.points[0]!.qualityWarning, true); assert.equal(model.lineGeoJson.features.length, 0);
});
