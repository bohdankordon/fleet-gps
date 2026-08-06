import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { AlertSettingsStateError, type AlertSettingsStoredRow } from "./alert-settings.types";

@Injectable()
export class AlertSettingsRepository {
  public constructor(private readonly database: DatabaseService) {}

  public async getSingleton(): Promise<AlertSettingsStoredRow> {
    try {
      const settings = await this.database.getClient().applicationSettings.findUnique({
        where: { id: 1 },
        select: {
          speedRuleEnabled: true,
          inactivityRuleEnabled: true,
          citySpeedLimitKph: true,
          outsideCitySpeedLimitKph: true,
          speedToleranceKph: true,
          speedingConfirmationUpdates: true,
          inactivityDistanceMeters: true,
          inactivityDurationMinutes: true,
          timezone: true,
          cityGeofenceGeoJson: true,
          updatedAt: true,
        },
      });
      if (settings === null) throw new AlertSettingsStateError("missing");
      return settings;
    } catch (error) {
      if (error instanceof AlertSettingsStateError) throw error;
      throw new AlertSettingsStateError("database");
    }
  }
}
