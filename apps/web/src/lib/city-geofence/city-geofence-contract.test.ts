import assert from "node:assert/strict";
import test from "node:test";
import { CityGeofenceContractError, parseCityGeofenceMapResponse } from "./city-geofence-contract";

const polygon = {
  type: "Polygon",
  coordinates: [[[28, 49], [29, 49], [29, 50], [28, 49]]],
} as const;
const configured = { generatedAt: "2026-08-10T12:00:00.000Z", configured: true, geometry: polygon };

test("accepts configured Polygon and unconfigured null responses", () => {
  assert.deepEqual(parseCityGeofenceMapResponse(configured).geometry, polygon);
  assert.equal(parseCityGeofenceMapResponse({ generatedAt: configured.generatedAt, configured: false, geometry: null }).geometry, null);
});

test("accepts inclusive longitude and latitude limits with preserved order", () => {
  const geometry = { type: "Polygon", coordinates: [[[-180, -90], [180, -90], [180, 90], [-180, -90]]] };
  assert.deepEqual(parseCityGeofenceMapResponse({ ...configured, geometry }).geometry?.coordinates[0]?.[0], [-180, -90]);
});

test("rejects invalid type, coordinate, ring, timestamp, and configured/null mismatch", () => {
  const invalid = [
    { ...configured, generatedAt: "not-a-date" },
    { ...configured, geometry: { type: "MultiPolygon", coordinates: [] } },
    { ...configured, geometry: { type: "Polygon", coordinates: [[[181, 49], [29, 49], [29, 50], [181, 49]]] } },
    { ...configured, geometry: { type: "Polygon", coordinates: [[[28, 91], [29, 49], [29, 50], [28, 91]]] } },
    { ...configured, geometry: { type: "Polygon", coordinates: [[[28, 49], [29, 49], [29, 50], [28, 50]]] } },
    { ...configured, geometry: { type: "Polygon", coordinates: [[[28, 49], [29, 49], [28, 49]]] } },
    { ...configured, configured: false },
    { generatedAt: configured.generatedAt, configured: true, geometry: null },
  ];
  for (const value of invalid) assert.throws(() => parseCityGeofenceMapResponse(value), CityGeofenceContractError);
});

test("strict allow-list rejects sensitive or arbitrary fields", () => {
  assert.throws(() => parseCityGeofenceMapResponse({ ...configured, internalId: "secret" }), CityGeofenceContractError);
  assert.throws(() => parseCityGeofenceMapResponse({ ...configured, geometry: { ...polygon, sourcePath: "private.geojson" } }), CityGeofenceContractError);
});
