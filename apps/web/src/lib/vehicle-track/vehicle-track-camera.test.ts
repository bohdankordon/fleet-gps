import assert from "node:assert/strict";
import test from "node:test";
import { trackFixture, trackPoint } from "./vehicle-track-fixture";
import { buildVehicleTrackPresentation } from "./vehicle-track-presentation";
import { shouldFitVehicleTrackCamera, vehicleTrackCamera } from "./vehicle-track-camera";
test("camera uses geofence/fallback for empty, useful single zoom, and bounds for multiple", () => {
  const geofence = { generatedAt: "2026-08-10T00:00:00Z", configured: true, geometry: { type: "Polygon" as const, coordinates: [[[28, 49], [29, 49], [29, 50], [28, 49]]] as [number, number][][] } };
  assert.ok("bounds" in vehicleTrackCamera(buildVehicleTrackPresentation(trackFixture()), geofence)); assert.ok("center" in vehicleTrackCamera(buildVehicleTrackPresentation(trackFixture()), null));
  assert.deepEqual(vehicleTrackCamera(buildVehicleTrackPresentation(trackFixture([trackPoint()])), null), { center: [28.4, 49.2], zoom: 14 });
  assert.ok("bounds" in vehicleTrackCamera(buildVehicleTrackPresentation(trackFixture([trackPoint(), trackPoint("2026-08-10T10:00:01Z", { longitude: 28.5 })])), null));
});
test("initial and new range fit while same-range refresh/manual pan preserve camera", () => { assert.equal(shouldFitVehicleTrackCamera(false, false), true); assert.equal(shouldFitVehicleTrackCamera(true, true), true); assert.equal(shouldFitVehicleTrackCamera(true, false), false); });
