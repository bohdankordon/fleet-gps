import assert from "node:assert/strict";
import test from "node:test";
import { adminSettingsFieldLabelKeys, numericAdminSettingsBounds, validateAdminSettingsDraft } from "./admin-settings-form-model";
import { adminSettingsSchema } from "../lib/admin-settings/admin-settings-contract";
import type { AdminSettingsFieldKey } from "./admin-settings-form-model";

const base = { timezone: "Europe/Kyiv", minimumDailyDistanceMeters: 100, positionFreshnessSeconds: 60, speedRuleEnabled: true, citySpeedLimitKph: 50, outsideCitySpeedLimitKph: 90, speedToleranceKph: 10, speedingConfirmationUpdates: 2, inactivityRuleEnabled: true, inactivityDistanceMeters: 100, inactivityDurationMinutes: 30, tripMovementSpeedKph: 5, tripMovementConfirmationSeconds: 60, tripStopConfirmationSeconds: 300, tripDataGapSeconds: 300 };

test("Phase0 settings 20: every frontend numeric bound matches backend", () => {
  assert.deepEqual(numericAdminSettingsBounds.minimumDailyDistanceMeters, [0, 10000000]);
  assert.deepEqual(numericAdminSettingsBounds.positionFreshnessSeconds, [1, 86400]);
  assert.deepEqual(numericAdminSettingsBounds.citySpeedLimitKph, [1, 200]);
  assert.deepEqual(numericAdminSettingsBounds.inactivityDistanceMeters, [0, 5000]);
  assert.deepEqual(numericAdminSettingsBounds.tripMovementConfirmationSeconds, [1, 604800]);
  assert.equal(adminSettingsSchema.safeParse({ ...base, minimumDailyDistanceMeters: 10000000, positionFreshnessSeconds: 86400, cityGeofence: { configured: false, ringCount: 0, pointCount: 0 }, updatedAt: "2026-08-27T00:00:00.000Z", revision: 1 }).success, true);
});
test("Phase0 settings 21: oversized minimum daily distance rejected client-side", () => {
  assert.equal(validateAdminSettingsDraft({ ...base, minimumDailyDistanceMeters: 10000001 } as any), "minimumDailyDistanceMeters");
});
test("Phase0 settings 22: oversized freshness rejected client-side", () => {
  assert.equal(validateAdminSettingsDraft({ ...base, positionFreshnessSeconds: 86401 } as any), "positionFreshnessSeconds");
});
test("Phase0 settings 23: blank input is not silently interpreted as zero", () => {
  assert.equal(validateAdminSettingsDraft({ ...base, minimumDailyDistanceMeters: "" } as any), "minimumDailyDistanceMeters");
  assert.equal(validateAdminSettingsDraft({ ...base, positionFreshnessSeconds: "" } as any), "positionFreshnessSeconds");
});
test("Phase0 settings 24: explicit valid zero remains accepted where backend allows zero", () => {
  assert.equal(validateAdminSettingsDraft({ ...base, minimumDailyDistanceMeters: 0 } as any), null);
  assert.equal(validateAdminSettingsDraft({ ...base, speedToleranceKph: 0 } as any), null);
  assert.equal(validateAdminSettingsDraft({ ...base, positionFreshnessSeconds: 0 } as any), "positionFreshnessSeconds");
});
test("Phase0 settings 27: translated field-error uses human-readable labels, no raw camelCase", () => {
  for (const key of Object.keys(adminSettingsFieldLabelKeys) as AdminSettingsFieldKey[]) {
    assert.equal(adminSettingsFieldLabelKeys[key].startsWith("admin.settings."), true);
  }
});
