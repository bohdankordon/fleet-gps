import { createHash } from "node:crypto";
import type { AlertRulesSettings } from "../alert-settings";

/** Stable semantic identity for only the settings that can alter speeding classification. */
export function createSpeedingSettingsFingerprint(settings: AlertRulesSettings): string {
  const canonical = JSON.stringify({
    speedRuleEnabled: settings.speedRuleEnabled,
    citySpeedLimitKph: settings.citySpeedLimitKph,
    outsideCitySpeedLimitKph: settings.outsideCitySpeedLimitKph,
    speedToleranceKph: settings.speedToleranceKph,
    speedingConfirmationUpdates: settings.speedingConfirmationUpdates,
    cityGeofence: settings.cityGeofence.geometry,
  });
  return createHash("sha256").update("speeding-settings-v1\0").update(canonical).digest("hex");
}
