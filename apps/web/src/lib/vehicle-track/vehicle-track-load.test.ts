import assert from "node:assert/strict";
import test from "node:test";
import { overviewTrackFixture, trackFixture } from "./vehicle-track-fixture";
import { createVehicleTrackLoadedData, vehicleTrackLoadedKey, vehicleTrackLoadedRange } from "./vehicle-track-load";

test("creates a discriminated loaded model only when response range matches the derived mode", () => {
  const exact = createVehicleTrackLoadedData("EXACT", trackFixture()); const overview = createVehicleTrackLoadedData("OVERVIEW", overviewTrackFixture());
  assert.equal(exact?.mode, "EXACT"); assert.equal(overview?.mode, "OVERVIEW");
  assert.equal(vehicleTrackLoadedRange(exact!).to, trackFixture().range.to);
  assert.match(vehicleTrackLoadedKey(overview!), /^OVERVIEW:/);
  assert.notEqual(vehicleTrackLoadedKey(exact!), vehicleTrackLoadedKey(overview!));
  assert.equal(createVehicleTrackLoadedData("OVERVIEW", trackFixture()), null);
  assert.equal(createVehicleTrackLoadedData("EXACT", overviewTrackFixture()), null);
});
