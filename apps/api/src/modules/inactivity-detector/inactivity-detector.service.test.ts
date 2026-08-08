import assert from "node:assert/strict";
import test from "node:test";
import type { AlertRulesSettings, AlertSettingsService } from "../alert-settings";
import { InactivityDetectorService } from "./inactivity-detector.service";
import { InactivityDetectorStateMachine } from "./inactivity-detector.state-machine";

function settings(overrides: Partial<AlertRulesSettings> = {}): AlertRulesSettings {
  return Object.freeze({ speedRuleEnabled: true, inactivityRuleEnabled: true, citySpeedLimitKph: 50, outsideCitySpeedLimitKph: 90, speedToleranceKph: 10, speedingConfirmationUpdates: 2, inactivityDistanceMeters: 300, inactivityDurationMinutes: 60, timezone: "UTC", cityGeofence: Object.freeze({ configured: false, geometry: null }), effectiveSpeedThresholds: Object.freeze({ cityKph: 60, outsideCityKph: 100 }), updatedAt: "2026-08-06T10:00:00.000Z", ...overrides });
}

const observation = (minute: number) => ({ vehicleId: "vehicle", observedAt: new Date(Date.UTC(2026, 7, 6, 10, 0, 0) + minute * 60_000).toISOString(), latitude: 0, longitude: 0 });

test("orchestration reads one AlertSettingsService snapshot for every valid observation", async () => {
  let reads = 0; const snapshot = settings();
  const service = new InactivityDetectorService({ getSettings: async () => { reads += 1; return snapshot; } } as unknown as AlertSettingsService, new InactivityDetectorStateMachine());
  assert.equal((await service.detect(observation(0))).status, "COLLECTING");
  assert.equal((await service.detect(observation(59 + 59 / 60))).status, "COLLECTING");
  assert.equal((await service.detect(observation(60))).status, "CONFIRMED");
  assert.equal(reads, 3);
});

test("orchestration does not read settings for invalid input and has no persistence collaborator", async () => {
  let reads = 0;
  const service = new InactivityDetectorService({ getSettings: async () => { reads += 1; return settings(); } } as unknown as AlertSettingsService, new InactivityDetectorStateMachine());
  const result = await service.detect({ ...observation(0), latitude: Number.NaN });
  assert.equal(result.status, "IGNORED"); assert.equal(result.reason, "INVALID_OBSERVATION"); assert.equal(reads, 0);
});
