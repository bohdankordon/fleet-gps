import assert from "node:assert/strict";
import test from "node:test";
import type { AlertSettingsService } from "../alert-settings";
import type { GeoJsonPolygon } from "../alert-settings";
import { validateGeoJsonPolygon } from "../alert-settings/alert-settings.validation";
import { CityGeofenceService } from "./city-geofence.service";

const polygon = validateGeoJsonPolygon({ type: "Polygon", coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] })!;
const settings = (geometry: GeoJsonPolygon | null = null) => Object.freeze({ cityGeofence: Object.freeze({ configured: geometry !== null, geometry }), updatedAt: "2026-08-06T10:00:00.000Z" }) as never;

test("reads one fresh immutable settings snapshot per classification without exposing geometry or point", async () => {
  let reads = 0;
  const service = new CityGeofenceService({ getSettings: async () => { reads += 1; return reads === 1 ? settings(null) : settings(polygon); } } as unknown as AlertSettingsService);
  const first = await service.classifyPoint({ longitude: 5, latitude: 5 });
  const second = await service.classifyPoint({ longitude: 5, latitude: 5 });
  assert.deepEqual(first, { classification: "UNCONFIGURED", speedLimitZone: "UNKNOWN", geofenceConfigured: false });
  assert.deepEqual(second, { classification: "INSIDE", speedLimitZone: "CITY", geofenceConfigured: true });
  assert.equal(reads, 2);
  assert.equal(Object.isFrozen(second), true);
  assert.equal(Object.hasOwn(second, "geometry"), false);
  assert.equal(Object.hasOwn(second, "point"), false);
});

test("returns a safe read-only diagnostic contract", async () => {
  const service = new CityGeofenceService({ getSettings: async () => settings(null) } as unknown as AlertSettingsService);
  assert.deepEqual(await service.getDiagnostic(), { configured: false, classificationAvailable: false, boundaryPolicy: "CITY", updatedAt: "2026-08-06T10:00:00.000Z" });
});
