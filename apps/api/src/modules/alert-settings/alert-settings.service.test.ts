import assert from "node:assert/strict";
import test from "node:test";
import { AlertSettingsRepository } from "./alert-settings.repository";
import { AlertSettingsService } from "./alert-settings.service";
import { AlertSettingsStateError, type AlertSettingsStoredRow } from "./alert-settings.types";

const row = (overrides: Partial<AlertSettingsStoredRow> = {}): AlertSettingsStoredRow => ({ speedRuleEnabled: true, inactivityRuleEnabled: true, citySpeedLimitKph: 50, outsideCitySpeedLimitKph: 90, speedToleranceKph: 10, speedingConfirmationUpdates: 2, inactivityDistanceMeters: 300, inactivityDurationMinutes: 60, timezone: "Europe/Kyiv", cityGeofenceGeoJson: null, updatedAt: new Date("2026-08-06T10:00:00.000Z"), ...overrides });

test("reads the singleton once per call and maps the defaults to fresh frozen snapshots", async () => {
  let reads = 0;
  const service = new AlertSettingsService({ getSingleton: async () => { reads += 1; return row(); } } as unknown as AlertSettingsRepository);
  const first = await service.getSettings();
  const second = await service.getSettings();
  assert.equal(reads, 2);
  assert.notEqual(first, second);
  assert.deepEqual(first, { speedRuleEnabled: true, inactivityRuleEnabled: true, citySpeedLimitKph: 50, outsideCitySpeedLimitKph: 90, speedToleranceKph: 10, speedingConfirmationUpdates: 2, inactivityDistanceMeters: 300, inactivityDurationMinutes: 60, timezone: "Europe/Kyiv", cityGeofence: { configured: false, geometry: null }, effectiveSpeedThresholds: { cityKph: 60, outsideCityKph: 100 }, updatedAt: "2026-08-06T10:00:00.000Z" });
  assert.equal(Object.hasOwn(first.effectiveSpeedThresholds, "outsideCityKph"), true);
  assert.equal(Object.hasOwn(first.effectiveSpeedThresholds, "outsideKph"), false);
  assert.equal(JSON.stringify(first).includes("outsideKph"), false);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.cityGeofence), true);
  assert.equal(Object.isFrozen(first.effectiveSpeedThresholds), true);
});

test("publishes outsideCityKph and never the deprecated outsideKph key", async () => {
  const service = new AlertSettingsService({ getSingleton: async () => row() } as unknown as AlertSettingsRepository);
  const snapshot = await service.getSettings();
  const serialized = JSON.stringify(snapshot);
  assert.equal(Object.hasOwn(snapshot.effectiveSpeedThresholds, "outsideCityKph"), true);
  assert.equal(Object.hasOwn(snapshot.effectiveSpeedThresholds, "outsideKph"), false);
  assert.equal(serialized.includes("outsideCityKph"), true);
  assert.equal(serialized.includes("outsideKph"), false);
});

test("preserves the stored timezone, copies a configured polygon, and does not share raw references", async () => {
  const raw = { type: "Polygon", coordinates: [[[28.4, 49.2], [28.5, 49.2], [28.5, 49.3], [28.4, 49.2]]] };
  const service = new AlertSettingsService({ getSingleton: async () => row({ timezone: "UTC", cityGeofenceGeoJson: raw }) } as unknown as AlertSettingsRepository);
  const result = await service.getSettings();
  raw.coordinates[0]![0]![0] = 0;
  assert.equal(result.timezone, "UTC");
  assert.equal(result.cityGeofence.configured, true);
  assert.equal(result.cityGeofence.geometry?.coordinates[0]?.[0]?.[0], 28.4);
  assert.equal(Object.isFrozen(result.cityGeofence.geometry), true);
});

test("returns safe state errors for missing, invalid, and database failure without raw details", async () => {
  const cases = [
    new AlertSettingsService({ getSingleton: async () => { throw new AlertSettingsStateError("missing"); } } as unknown as AlertSettingsRepository),
    new AlertSettingsService({ getSingleton: async () => row({ timezone: "private invalid timezone" }) } as unknown as AlertSettingsRepository),
    new AlertSettingsService({ getSingleton: async () => { throw new Error("postgresql://private"); } } as unknown as AlertSettingsRepository),
  ];
  for (const service of cases) await assert.rejects(service.getSettings(), (error: unknown) => error instanceof AlertSettingsStateError && !error.message.includes("private"));
});
