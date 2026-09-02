import assert from "node:assert/strict";
import test from "node:test";
import type { FleetMapResponse } from "./fleet-map-contract";
import { fleetMapVehicleHref, parseFleetMapVehicleId, resolveFleetMapDeepLink } from "./fleet-map-deep-link";

const VEHICLE_ID = "00000000-0000-4000-8000-000000000001";
const UNAVAILABLE_ID = "00000000-0000-4000-8000-000000000002";
const snapshot: FleetMapResponse = {
  generatedAt: "2026-08-10T12:01:00.000Z",
  positionFreshnessSeconds: 300,
  summary: { totalVehicles: 2, withPosition: 1, withoutPosition: 1, invalidPosition: 0, fresh: 1, stale: 0 },
  vehicles: [{ vehicle: { id: VEHICLE_ID, name: "Taxi" }, position: { latitude: 49, longitude: 28, observedAt: "2026-08-10T12:00:00.000Z" }, speedKph: null, freshness: "FRESH" }],
};

test("vehicle map links use one explicit encoded UUID query contract", () => {
  assert.equal(fleetMapVehicleHref(VEHICLE_ID), `/map?vehicleId=${VEHICLE_ID}`);
  assert.equal(fleetMapVehicleHref("not-a-uuid"), "/map");
  assert.equal(parseFleetMapVehicleId(VEHICLE_ID), VEHICLE_ID);
  assert.equal(parseFleetMapVehicleId([VEHICLE_ID]), null);
  assert.equal(parseFleetMapVehicleId("not-a-uuid"), null);
});

test("a valid authorized position opens the existing first-selection state", () => {
  assert.deepEqual(resolveFleetMapDeepLink(snapshot, VEHICLE_ID), {
    selection: { selectedVehicleId: VEHICLE_ID, hasSelectedVehicle: true },
    requestedVehicleUnavailable: false,
  });
});

test("a no-position or inaccessible vehicle stays unselected without exposing which reason applies", () => {
  assert.deepEqual(resolveFleetMapDeepLink(snapshot, UNAVAILABLE_ID), {
    selection: { selectedVehicleId: null, hasSelectedVehicle: false },
    requestedVehicleUnavailable: true,
  });
});

test("plain map navigation preserves the ordinary unselected state without a notice", () => {
  assert.deepEqual(resolveFleetMapDeepLink(snapshot, null), {
    selection: { selectedVehicleId: null, hasSelectedVehicle: false },
    requestedVehicleUnavailable: false,
  });
});
