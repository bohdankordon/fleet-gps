import assert from "node:assert/strict";
import test from "node:test";
import { trackFixture, trackPoint } from "./vehicle-track-fixture";
import { buildVehicleTrackPresentation } from "./vehicle-track-presentation";
import { reconcileVehicleTrackSelection, selectedVehicleTrackPoint } from "./vehicle-track-selection";
test("selection uses ephemeral index keys and only exact tuples survive same-range refresh", () => {
  const first = buildVehicleTrackPresentation(trackFixture([trackPoint(), trackPoint("2026-08-10T10:00:01Z", { speedKph: 10 })]));
  const same = buildVehicleTrackPresentation(trackFixture([trackPoint(), trackPoint("2026-08-10T10:00:01Z", { speedKph: 10 })]));
  const changed = buildVehicleTrackPresentation(trackFixture([trackPoint(), trackPoint("2026-08-10T10:00:01Z", { speedKph: 11 })]));
  assert.equal(selectedVehicleTrackPoint(first, "1")?.point.speedKph, 10); assert.equal(reconcileVehicleTrackSelection(first, same, "1", true), "1"); assert.equal(reconcileVehicleTrackSelection(first, changed, "1", true), null); assert.equal(reconcileVehicleTrackSelection(first, same, "1", false), null);
});
