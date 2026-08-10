import assert from "node:assert/strict";
import test from "node:test";
import { overviewSegment, overviewTrackFixture, trackFixture, trackPoint } from "./vehicle-track-fixture";
import { buildVehicleTrackOverviewPresentation } from "./vehicle-track-overview-presentation";
import { buildVehicleTrackPresentation } from "./vehicle-track-presentation";
import { reconcileVehicleTrackSelection, selectedVehicleTrackPoint } from "./vehicle-track-selection";
test("selection uses ephemeral index keys and only exact tuples survive same-range refresh", () => {
  const first = buildVehicleTrackPresentation(trackFixture([trackPoint(), trackPoint("2026-08-10T10:00:01Z", { speedKph: 10 })]));
  const same = buildVehicleTrackPresentation(trackFixture([trackPoint(), trackPoint("2026-08-10T10:00:01Z", { speedKph: 10 })]));
  const changed = buildVehicleTrackPresentation(trackFixture([trackPoint(), trackPoint("2026-08-10T10:00:01Z", { speedKph: 11 })]));
  assert.equal(selectedVehicleTrackPoint(first, "1")?.point.speedKph, 10); assert.equal(reconcileVehicleTrackSelection(first, same, "1", true), "1"); assert.equal(reconcileVehicleTrackSelection(first, changed, "1", true), null); assert.equal(reconcileVehicleTrackSelection(first, same, "1", false), null);
});
test("overview selection survives only a same-mode same-range exact tuple refresh", () => {
  const first = buildVehicleTrackOverviewPresentation(overviewTrackFixture([overviewSegment([trackPoint("2026-08-01T00:00:00Z"), trackPoint("2026-08-01T00:20:00Z", { speedKph: 10 })], 500)]));
  const same = buildVehicleTrackOverviewPresentation(overviewTrackFixture([overviewSegment([trackPoint("2026-08-01T00:00:00Z"), trackPoint("2026-08-01T00:20:00Z", { speedKph: 10 })], 500)]));
  const exact = buildVehicleTrackPresentation(trackFixture([trackPoint("2026-08-01T00:00:00Z"), trackPoint("2026-08-01T00:20:00Z", { speedKph: 10 })]));
  assert.equal(reconcileVehicleTrackSelection(first, same, "1", true), "1");
  assert.equal(reconcileVehicleTrackSelection(first, exact, "1", false), null);
});
