import assert from "node:assert/strict";
import test from "node:test";
import type { AlertRulesSettings } from "../alert-settings";
import { createSpeedingSettingsFingerprint } from "./speeding-settings-fingerprint";

function settings(overrides: Partial<AlertRulesSettings> = {}): AlertRulesSettings {
  return { speedRuleEnabled: true, inactivityRuleEnabled: true, citySpeedLimitKph: 50, outsideCitySpeedLimitKph: 90, speedToleranceKph: 10, speedingConfirmationUpdates: 2, inactivityDistanceMeters: 300, inactivityDurationMinutes: 60, timezone: "UTC", cityGeofence: { configured: true, geometry: null }, effectiveSpeedThresholds: { cityKph: 60, outsideCityKph: 100 }, updatedAt: "2026-09-16T00:00:00.000Z", ...overrides };
}

test("fingerprint is deterministic and changes for every speeding detector rule input", () => {
  const baseline = createSpeedingSettingsFingerprint(settings());
  assert.equal(baseline, createSpeedingSettingsFingerprint(settings()));
  assert.match(baseline, /^[0-9a-f]{64}$/);
  for (const changed of [
    settings({ speedRuleEnabled: false }), settings({ citySpeedLimitKph: 51 }), settings({ outsideCitySpeedLimitKph: 91 }), settings({ speedToleranceKph: 11 }), settings({ speedingConfirmationUpdates: 3 }),
    settings({ cityGeofence: { configured: true, geometry: { type: "Polygon", coordinates: [[[28, 49], [29, 49], [29, 50], [28, 49]]] } } }),
  ]) assert.notEqual(createSpeedingSettingsFingerprint(changed), baseline);
});

test("unrelated inactivity, timezone, derived, and revision fields do not invalidate a speeding streak", () => {
  const baseline = createSpeedingSettingsFingerprint(settings());
  const unrelated = settings({ inactivityRuleEnabled: false, inactivityDistanceMeters: 999, inactivityDurationMinutes: 120, timezone: "Europe/Kyiv", effectiveSpeedThresholds: { cityKph: 999, outsideCityKph: 999 }, updatedAt: "2026-09-17T00:00:00.000Z" });
  assert.equal(createSpeedingSettingsFingerprint(unrelated), baseline);
});
