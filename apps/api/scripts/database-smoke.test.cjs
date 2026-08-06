const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const test = require("node:test");
const { validateStoredSettings } = require("./database-smoke.cjs");
const { assertCityGeofenceContract } = require("./alert-settings-smoke.cjs");
const { assertDiagnosticState } = require("./city-geofence-smoke.cjs");
const validators = require("../dist/modules/alert-settings/alert-settings.validation");

function validSettings(overrides = {}) {
  return {
    id: 1,
    timezone: "Europe/Kyiv",
    speedRuleEnabled: true,
    inactivityRuleEnabled: true,
    citySpeedLimitKph: 50,
    outsideCitySpeedLimitKph: 90,
    speedToleranceKph: 10,
    speedingConfirmationUpdates: 2,
    inactivityDistanceMeters: 300,
    inactivityDurationMinutes: 60,
    cityGeofenceGeoJson: null,
    ...overrides,
  };
}

const polygon = { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] };

test("database smoke fails safely when DATABASE_URL is absent", () => {
  const result = spawnSync(process.execPath, ["scripts/database-smoke.cjs"], { cwd: path.resolve(__dirname, ".."), env: { PATH: process.env.PATH }, encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout.trim(), "errorType: configuration");
  const output = `${result.stdout}\n${result.stderr}`;
  for (const forbidden of ["postgresql://", "password", "DATABASE_URL", "Error:", "Prisma"]) assert.equal(output.includes(forbidden), false);
});

test("database stored-settings validation accepts null and valid Polygon geofences", () => {
  assert.equal(validateStoredSettings(validSettings(), validators).polygon, null);
  const validated = validateStoredSettings(validSettings({ cityGeofenceGeoJson: polygon }), validators);
  assert.equal(validated.polygon.type, "Polygon");
});

test("database stored-settings validation accepts non-default valid business settings and rejects invalid values", () => {
  const valid = validateStoredSettings(validSettings({
    citySpeedLimitKph: 55,
    outsideCitySpeedLimitKph: 95,
    speedToleranceKph: 5,
    speedingConfirmationUpdates: 3,
    inactivityDistanceMeters: 450,
    inactivityDurationMinutes: 90,
  }), validators);
  assert.equal(valid.speed.cityThreshold, 60);
  assert.equal(valid.speed.outsideThreshold, 100);
  assert.throws(() => validateStoredSettings(validSettings({ citySpeedLimitKph: "55" }), validators));
  assert.throws(() => validateStoredSettings(validSettings({ cityGeofenceGeoJson: { type: "Feature", geometry: polygon } }), validators));
});

test("alert-settings smoke enforces configured state against geometry", () => {
  assert.equal(assertCityGeofenceContract({ configured: false, geometry: null }, validators.validateGeoJsonPolygon), null);
  assert.equal(assertCityGeofenceContract({ configured: true, geometry: polygon }, validators.validateGeoJsonPolygon).type, "Polygon");
  assert.throws(() => assertCityGeofenceContract({ configured: true, geometry: null }, validators.validateGeoJsonPolygon));
});

test("city-geofence diagnostic expectations follow either database state", () => {
  assert.doesNotThrow(() => assertDiagnosticState({ configured: false, classificationAvailable: false, boundaryPolicy: "CITY" }, { geofenceIsNull: true }));
  assert.doesNotThrow(() => assertDiagnosticState({ configured: true, classificationAvailable: true, boundaryPolicy: "CITY" }, { geofenceIsNull: false }));
  assert.throws(() => assertDiagnosticState({ configured: false, classificationAvailable: false, boundaryPolicy: "CITY" }, { geofenceIsNull: false }));
});
