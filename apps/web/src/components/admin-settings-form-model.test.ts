import assert from "node:assert/strict";
import test from "node:test";
import { adminSettingsDirty, adminSettingsDraft, adminSettingsPatchPayload, validateAdminSettingsDraft } from "./admin-settings-form-model";
import type { AdminSettings } from "@/lib/admin-settings/admin-settings-contract";

const initial: AdminSettings = { timezone: "Europe/Kyiv", minimumDailyDistanceMeters: 100, positionFreshnessSeconds: 60, speedRuleEnabled: true, citySpeedLimitKph: 50, outsideCitySpeedLimitKph: 90, speedToleranceKph: 10, speedingConfirmationUpdates: 2, inactivityRuleEnabled: true, inactivityDistanceMeters: 100, inactivityDurationMinutes: 30, cityGeofence: { configured: false, ringCount: 0, pointCount: 0 }, updatedAt: "2026-08-27T00:00:00.000Z", revision: 7 };

test("settings form preserves canonical units, dirty state, booleans, and a single revisioned grouped PATCH", () => {
  const draft = adminSettingsDraft(initial);
  assert.equal(adminSettingsDirty(draft, initial), false);
  const changed = { ...draft, citySpeedLimitKph: 55, outsideCitySpeedLimitKph: 95, speedRuleEnabled: false };
  assert.equal(adminSettingsDirty(changed, initial), true);
  assert.equal(adminSettingsDirty({ ...changed, citySpeedLimitKph: 50, outsideCitySpeedLimitKph: 90, speedRuleEnabled: true }, initial), false);
  assert.deepEqual(adminSettingsPatchPayload(changed, initial.revision), { revision: 7, ...changed });
});

test("client validation rejects invalid timezone and every scalar boundary without coercion", () => {
  const draft = adminSettingsDraft(initial);
  assert.equal(validateAdminSettingsDraft(draft), null);
  assert.equal(validateAdminSettingsDraft({ ...draft, minimumDailyDistanceMeters: 10_000_001, positionFreshnessSeconds: 86_401 }), null);
  assert.equal(validateAdminSettingsDraft({ ...draft, timezone: "Not/AZone" }), "timezone");
  for (const [key, value] of [["minimumDailyDistanceMeters", -1], ["positionFreshnessSeconds", 0], ["citySpeedLimitKph", 201], ["outsideCitySpeedLimitKph", 0], ["speedToleranceKph", 51], ["speedingConfirmationUpdates", 11], ["inactivityDistanceMeters", 5001], ["inactivityDurationMinutes", 0]] as const) assert.equal(validateAdminSettingsDraft({ ...draft, [key]: value }), key);
  assert.equal(validateAdminSettingsDraft({ ...draft, speedToleranceKph: 1.5 }), "speedToleranceKph");
});
