import assert from "node:assert/strict";
import test from "node:test";
import type { FleetMapResponse } from "./fleet-map-contract";
import { fleetMapSearchOptions } from "./fleet-map-search";

const snapshot: FleetMapResponse = {
  generatedAt: "2026-08-10T12:01:00.000Z",
  positionFreshnessSeconds: 300,
  summary: { totalVehicles: 2, withPosition: 2, withoutPosition: 0, invalidPosition: 0, fresh: 1, stale: 1 },
  vehicles: [
    { vehicle: { id: "00000000-0000-4000-8000-000000000001", name: "TAXI AB5466YA" }, position: { latitude: 49, longitude: 28, observedAt: "2026-08-10T12:00:00.000Z" }, speedKph: 12, freshness: "FRESH" },
    { vehicle: { id: "00000000-0000-4000-8000-000000000002", name: "Service Van" }, position: { latitude: 49.1, longitude: 28.1, observedAt: "2026-08-10T11:00:00.000Z" }, speedKph: null, freshness: "STALE" },
  ],
};

test("searches already-loaded Map vehicle names locally without changing identity values", () => {
  assert.deepEqual(fleetMapSearchOptions(snapshot, " taxi "), [{ value: snapshot.vehicles[0]!.vehicle.id, label: "TAXI AB5466YA" }]);
  assert.deepEqual(fleetMapSearchOptions(snapshot, "VAN"), [{ value: snapshot.vehicles[1]!.vehicle.id, label: "Service Van" }]);
  assert.equal(fleetMapSearchOptions(snapshot, "missing").length, 0);
  assert.equal(fleetMapSearchOptions(snapshot, "").length, 2);
});
