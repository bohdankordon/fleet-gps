import assert from "node:assert/strict";
import test from "node:test";
import type { AlertRulesSettings, AlertSettingsService } from "../alert-settings";
import type { CityGeofenceService, GeoPoint } from "../city-geofence";
import { SpeedingDetectorService } from "./speeding-detector.service";
import { SpeedingDetectorStateMachine } from "./speeding-detector.state-machine";

function settings(overrides: Partial<AlertRulesSettings> = {}): AlertRulesSettings {
  return Object.freeze({ speedRuleEnabled: true, citySpeedLimitKph: 50, outsideCitySpeedLimitKph: 90, speedToleranceKph: 10, speedingConfirmationUpdates: 2, effectiveSpeedThresholds: Object.freeze({ cityKph: 60, outsideCityKph: 100 }), inactivityRuleEnabled: true, inactivityDistanceMeters: 1, inactivityDurationMinutes: 1, timezone: "UTC", cityGeofence: Object.freeze({ configured: true, geometry: null }), updatedAt: "2026-08-06T10:00:00.000Z", ...overrides });
}

const observation = (second: number, speedKph: number, longitude = 1) => ({ vehicleId: "vehicle", observedAt: `2026-08-06T10:00:${String(second).padStart(2, "0")}.000Z`, speedKph, latitude: 49, longitude });

test("orchestration obtains settings once and delegates zone classification to CityGeofenceService", async () => {
  let settingsReads = 0; let classified = 0; let receivedSettings: AlertRulesSettings | undefined;
  const snapshot = settings();
  const detector = new SpeedingDetectorService(
    { getSettings: async () => { settingsReads += 1; return snapshot; } } as unknown as AlertSettingsService,
    { classifyPointWithSettings: (point: GeoPoint, inputSettings: AlertRulesSettings) => { classified += 1; receivedSettings = inputSettings; return Object.freeze({ classification: point.longitude === 0 ? "BOUNDARY" : point.longitude > 0 ? "INSIDE" : "OUTSIDE", speedLimitZone: point.longitude < 0 ? "OUTSIDE_CITY" : "CITY", geofenceConfigured: true }); } } as unknown as CityGeofenceService,
    new SpeedingDetectorStateMachine(),
  );
  const city = await detector.detect(observation(1, 60.1));
  const boundary = await detector.detect({ ...observation(2, 60.1), longitude: 0 });
  const outside = await detector.detect({ ...observation(3, 101), longitude: -1 });
  assert.equal(city.status, "PENDING"); assert.equal(city.thresholdKph, 60);
  assert.equal(boundary.status, "CONFIRMED"); assert.equal(boundary.zone, "CITY");
  assert.equal(outside.status, "PENDING"); assert.equal(outside.thresholdKph, 100);
  assert.equal(settingsReads, 3); assert.equal(classified, 3); assert.equal(receivedSettings, snapshot);
});

test("orchestration does not read settings or classify invalid observations", async () => {
  let settingsReads = 0; let classified = 0;
  const detector = new SpeedingDetectorService(
    { getSettings: async () => { settingsReads += 1; return settings(); } } as unknown as AlertSettingsService,
    { classifyPointWithSettings: () => { classified += 1; throw new Error("unreachable"); } } as unknown as CityGeofenceService,
    new SpeedingDetectorStateMachine(),
  );
  const result = await detector.detect({ ...observation(1, 61), latitude: Number.NaN });
  assert.equal(result.status, "IGNORED"); assert.equal(result.reason, "INVALID_OBSERVATION"); assert.equal(settingsReads, 0); assert.equal(classified, 0);
});
