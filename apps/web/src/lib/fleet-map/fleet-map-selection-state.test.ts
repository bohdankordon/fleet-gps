import assert from "node:assert/strict";
import test from "node:test";
import type { FleetMapResponse } from "./fleet-map-contract";
import { clearFleetMapSelection, initialFleetMapSelectionState, selectFleetMapVehicle } from "./fleet-map-selection";

const FIRST_ID = "00000000-0000-4000-8000-000000000001";
const SECOND_ID = "00000000-0000-4000-8000-000000000002";

const snapshot: FleetMapResponse = {
  generatedAt: "2026-08-10T12:01:00.000Z",
  positionFreshnessSeconds: 300,
  summary: { totalVehicles: 2, withPosition: 2, withoutPosition: 0, invalidPosition: 0, fresh: 2, stale: 0 },
  vehicles: [FIRST_ID, SECOND_ID].map((id, index) => ({
    vehicle: { id, name: `Taxi ${index + 1}`, group: null },
    position: { latitude: 49 + index, longitude: 28 + index, observedAt: "2026-08-10T12:00:00.000Z" },
    speedKph: null,
    freshness: "FRESH" as const,
  })),
};

test("selection helper is initial-only across first selection, later selection, close, and reopen", () => {
  assert.deepEqual(initialFleetMapSelectionState, { selectedVehicleId: null, hasSelectedVehicle: false });

  const first = selectFleetMapVehicle(snapshot, initialFleetMapSelectionState, FIRST_ID);
  assert.deepEqual(first, { selectedVehicleId: FIRST_ID, hasSelectedVehicle: true });

  const later = selectFleetMapVehicle(snapshot, first, SECOND_ID);
  assert.deepEqual(later, { selectedVehicleId: SECOND_ID, hasSelectedVehicle: true });

  const closed = clearFleetMapSelection(later);
  assert.deepEqual(closed, { selectedVehicleId: null, hasSelectedVehicle: true });

  const reopened = selectFleetMapVehicle(snapshot, closed, FIRST_ID);
  assert.deepEqual(reopened, { selectedVehicleId: FIRST_ID, hasSelectedVehicle: true });
});

test("an unknown vehicle cannot dismiss the initial helper or change a learned selection", () => {
  const invalidInitial = selectFleetMapVehicle(snapshot, initialFleetMapSelectionState, "missing");
  assert.equal(invalidInitial, initialFleetMapSelectionState);

  const selected = selectFleetMapVehicle(snapshot, initialFleetMapSelectionState, FIRST_ID);
  assert.equal(selectFleetMapVehicle(snapshot, selected, "missing"), selected);
});
