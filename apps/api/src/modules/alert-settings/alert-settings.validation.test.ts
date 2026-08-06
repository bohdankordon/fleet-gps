import assert from "node:assert/strict";
import test from "node:test";
import { AlertSettingsStateError } from "./alert-settings.types";
import { validateGeoJsonPolygon, validateInactivitySettings, validateSpeedSettings, validateTimezone } from "./alert-settings.validation";

const defaults = () => ({ citySpeedLimitKph: 50, outsideCitySpeedLimitKph: 90, speedToleranceKph: 10, speedingConfirmationUpdates: 2, inactivityDistanceMeters: 300, inactivityDurationMinutes: 60 });
const polygon = () => ({ type: "Polygon", coordinates: [[[28.4, 49.2], [28.5, 49.2], [28.5, 49.3], [28.4, 49.2]]] });
const invalid = (action: () => unknown): void => assert.throws(action, AlertSettingsStateError);

test("validates default speed and inactivity settings with effective thresholds", () => {
  const values = defaults();
  assert.deepEqual(validateSpeedSettings(values), { citySpeedLimitKph: 50, outsideCitySpeedLimitKph: 90, speedToleranceKph: 10, speedingConfirmationUpdates: 2, cityThreshold: 60, outsideThreshold: 100 });
  assert.deepEqual(validateInactivitySettings(values), { inactivityDistanceMeters: 300, inactivityDurationMinutes: 60 });
});

test("rejects invalid speed values, non-integers, NaN, and infinity", () => {
  for (const value of [0, 201, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) invalid(() => validateSpeedSettings({ ...defaults(), citySpeedLimitKph: value }));
  for (const value of [0, 201, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) invalid(() => validateSpeedSettings({ ...defaults(), outsideCitySpeedLimitKph: value }));
  for (const value of [-1, 51, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) invalid(() => validateSpeedSettings({ ...defaults(), speedToleranceKph: value }));
  for (const value of [0, 11, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) invalid(() => validateSpeedSettings({ ...defaults(), speedingConfirmationUpdates: value }));
});

test("rejects invalid inactivity values", () => {
  for (const value of [-1, 5_001, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) invalid(() => validateInactivitySettings({ ...defaults(), inactivityDistanceMeters: value }));
  for (const value of [0, 1_441, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) invalid(() => validateInactivitySettings({ ...defaults(), inactivityDurationMinutes: value }));
});

test("validates configured IANA timezone without a system fallback", () => {
  assert.equal(validateTimezone("Europe/Kyiv"), "Europe/Kyiv");
  invalid(() => validateTimezone("not-a-timezone"));
});

test("accepts null and deep-freezes a copied Polygon", () => {
  assert.equal(validateGeoJsonPolygon(null), null);
  const input = polygon();
  const result = validateGeoJsonPolygon(input);
  assert.ok(result !== null);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.coordinates), true);
  assert.equal(Object.isFrozen(result.coordinates[0]), true);
  assert.equal(Object.isFrozen(result.coordinates[0]?.[0]), true);
  input.coordinates[0]![0]![0] = 0;
  assert.equal(result.coordinates[0]?.[0]?.[0], 28.4);
});

test("rejects unsupported and malformed GeoJSON Polygon values", () => {
  invalid(() => validateGeoJsonPolygon({ type: "Feature", coordinates: [] }));
  invalid(() => validateGeoJsonPolygon({ type: "MultiPolygon", coordinates: [] }));
  invalid(() => validateGeoJsonPolygon({ type: "Polygon", coordinates: [] }));
  invalid(() => validateGeoJsonPolygon({ type: "Polygon", coordinates: [[[1, 2], [2, 2], [1, 2]]] }));
  invalid(() => validateGeoJsonPolygon({ type: "Polygon", coordinates: [[[1, 2], [2, 2], [2, 3], [1, 3]]] }));
  invalid(() => validateGeoJsonPolygon({ type: "Polygon", coordinates: [[[181, 2], [2, 2], [2, 3], [181, 2]]] }));
  invalid(() => validateGeoJsonPolygon({ type: "Polygon", coordinates: [[[1, 91], [2, 2], [2, 3], [1, 91]]] }));
  invalid(() => validateGeoJsonPolygon({ type: "Polygon", coordinates: [[[1, 2, 3], [2, 2], [2, 3], [1, 2, 3]]] }));
  invalid(() => validateGeoJsonPolygon({ type: "Polygon", coordinates: [[[Number.NaN, 2], [2, 2], [2, 3], [Number.NaN, 2]]] }));
  invalid(() => validateGeoJsonPolygon({ type: "Polygon", coordinates: [[[Number.POSITIVE_INFINITY, 2], [2, 2], [2, 3], [Number.POSITIVE_INFINITY, 2]]] }));
});
