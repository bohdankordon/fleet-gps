import assert from "node:assert/strict";
import test from "node:test";
import { fleetMapInitialCamera, VINNYTSIA_FALLBACK_CAMERA } from "./fleet-map-camera";
import type { FleetMapResponse } from "./fleet-map-contract";
const snapshot = (vehicles: FleetMapResponse["vehicles"]): FleetMapResponse => ({ generatedAt: "2026-08-10T12:01:00.000Z", positionFreshnessSeconds: 300, summary: { totalVehicles: vehicles.length, withPosition: vehicles.length, withoutPosition: 0, invalidPosition: 0, fresh: vehicles.length, stale: 0 }, vehicles });
const vehicle = (latitude: number, longitude: number) => ({ vehicle: { id: "00000000-0000-4000-8000-000000000001", name: "Taxi" }, position: { latitude, longitude, observedAt: "2026-08-10T12:00:00.000Z" }, speedKph: null, freshness: "FRESH" as const });
test("uses Vinnytsia fallback for empty, safe zoom for one marker, and longitude-first bounds for multiple", () => { assert.deepEqual(fleetMapInitialCamera(snapshot([])), VINNYTSIA_FALLBACK_CAMERA); assert.deepEqual(fleetMapInitialCamera(snapshot([vehicle(49.2, 28.4)])), { center: [28.4, 49.2], zoom: 13 }); assert.deepEqual(fleetMapInitialCamera(snapshot([vehicle(49, 28), vehicle(50, 29)])), { bounds: [[28, 49], [29, 50]], padding: 56, maxZoom: 14 }); });
