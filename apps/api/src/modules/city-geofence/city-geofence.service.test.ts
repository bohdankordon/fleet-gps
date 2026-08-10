import assert from "node:assert/strict";
import test from "node:test";
import { AlertSettingsService } from "../alert-settings";
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

test("returns the configured Polygon from the same authoritative settings source used by classification", async () => {
  let reads = 0;
  const writes: unknown[] = [];
  const externalRequests: unknown[] = [];
  const authoritative = { getSettings: async () => { reads += 1; return settings(polygon); }, replace: (value: unknown) => writes.push(value), fetch: (value: unknown) => externalRequests.push(value) };
  const service = new CityGeofenceService(authoritative as unknown as AlertSettingsService, { now: () => new Date("2026-08-10T12:00:00.000Z") });

  assert.deepEqual(await service.getMapProjection(), { generatedAt: "2026-08-10T12:00:00.000Z", configured: true, geometry: polygon });
  assert.deepEqual(await service.classifyPoint({ longitude: 5, latitude: 5 }), { classification: "INSIDE", speedLimitZone: "CITY", geofenceConfigured: true });
  assert.deepEqual(polygon.coordinates[0]?.[0], [0, 0]);
  assert.deepEqual(Object.keys(await service.getMapProjection()), ["generatedAt", "configured", "geometry"]);
  assert.equal(reads, 3);
  assert.deepEqual(writes, []);
  assert.deepEqual(externalRequests, []);
});

test("returns unconfigured null and fails safely when the canonical settings validation rejects geometry", async () => {
  const unconfigured = new CityGeofenceService({ getSettings: async () => settings(null) } as unknown as AlertSettingsService, { now: () => new Date("2026-08-10T12:00:00.000Z") });
  assert.deepEqual(await unconfigured.getMapProjection(), { generatedAt: "2026-08-10T12:00:00.000Z", configured: false, geometry: null });

  const invalidSettings = new AlertSettingsService({ getSingleton: async () => ({ speedRuleEnabled: true, inactivityRuleEnabled: true, citySpeedLimitKph: 50, outsideCitySpeedLimitKph: 90, speedToleranceKph: 10, speedingConfirmationUpdates: 2, inactivityDistanceMeters: 300, inactivityDurationMinutes: 60, timezone: "Europe/Kyiv", cityGeofenceGeoJson: { type: "Polygon", coordinates: [[[181, 0], [1, 0], [1, 1], [181, 0]]] }, updatedAt: new Date("2026-08-10T11:00:00.000Z") }) } as never);
  await assert.rejects(new CityGeofenceService(invalidSettings, { now: () => new Date("2026-08-10T12:00:00.000Z") }).getMapProjection());
});

test("rejects an invalid projection clock after reading the authoritative snapshot once", async () => {
  let reads = 0;
  const service = new CityGeofenceService({ getSettings: async () => { reads += 1; return settings(polygon); } } as unknown as AlertSettingsService, { now: () => new Date(Number.NaN) });
  await assert.rejects(service.getMapProjection());
  assert.equal(reads, 1);
});
