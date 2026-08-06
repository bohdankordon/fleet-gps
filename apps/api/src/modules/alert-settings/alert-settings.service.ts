import { Injectable } from "@nestjs/common";
import { AlertSettingsRepository } from "./alert-settings.repository";
import type { AlertRulesSettings } from "./alert-settings.types";
import { validateGeoJsonPolygon, validateInactivitySettings, validateRuleEnabled, validateSpeedSettings, validateTimezone, validateUpdatedAt } from "./alert-settings.validation";
import { AlertSettingsStateError } from "./alert-settings.types";

function freezeSnapshot(value: AlertRulesSettings): AlertRulesSettings {
  Object.freeze(value.cityGeofence);
  Object.freeze(value.effectiveSpeedThresholds);
  return Object.freeze(value);
}

@Injectable()
export class AlertSettingsService {
  public constructor(private readonly repository: AlertSettingsRepository) {}

  public async getSettings(): Promise<AlertRulesSettings> {
    let row;
    try {
      row = await this.repository.getSingleton();
    } catch (error) {
      if (error instanceof AlertSettingsStateError) throw error;
      throw new AlertSettingsStateError("database");
    }

    try {
      const speed = validateSpeedSettings(row);
      const inactivity = validateInactivitySettings(row);
      const geometry = validateGeoJsonPolygon(row.cityGeofenceGeoJson);
      return freezeSnapshot({
        speedRuleEnabled: validateRuleEnabled(row.speedRuleEnabled),
        inactivityRuleEnabled: validateRuleEnabled(row.inactivityRuleEnabled),
        citySpeedLimitKph: speed.citySpeedLimitKph,
        outsideCitySpeedLimitKph: speed.outsideCitySpeedLimitKph,
        speedToleranceKph: speed.speedToleranceKph,
        speedingConfirmationUpdates: speed.speedingConfirmationUpdates,
        inactivityDistanceMeters: inactivity.inactivityDistanceMeters,
        inactivityDurationMinutes: inactivity.inactivityDurationMinutes,
        timezone: validateTimezone(row.timezone),
        cityGeofence: Object.freeze({ configured: geometry !== null, geometry }),
        effectiveSpeedThresholds: Object.freeze({ cityKph: speed.cityThreshold, outsideCityKph: speed.outsideThreshold }),
        updatedAt: validateUpdatedAt(row.updatedAt),
      });
    } catch (error) {
      if (error instanceof AlertSettingsStateError) throw error;
      throw new AlertSettingsStateError("invalid");
    }
  }
}
