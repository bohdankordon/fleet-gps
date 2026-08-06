import { Injectable } from "@nestjs/common";
import { AlertSettingsService } from "../alert-settings";
import { classifyPointInPolygon } from "./city-geofence.geometry";
import { classifySpeedLimitZone } from "./city-geofence.policy";
import type { CityGeofenceDiagnostic, CityGeofenceResult, GeoPoint } from "./city-geofence.types";

@Injectable()
export class CityGeofenceService {
  public constructor(private readonly alertSettings: AlertSettingsService) {}

  public async classifyPoint(point: GeoPoint): Promise<CityGeofenceResult> {
    const settings = await this.alertSettings.getSettings();
    const classification = classifyPointInPolygon(settings.cityGeofence.geometry, point);
    return Object.freeze({ classification, speedLimitZone: classifySpeedLimitZone(classification), geofenceConfigured: settings.cityGeofence.configured });
  }

  public async getDiagnostic(): Promise<CityGeofenceDiagnostic> {
    const settings = await this.alertSettings.getSettings();
    return Object.freeze({ configured: settings.cityGeofence.configured, classificationAvailable: settings.cityGeofence.configured, boundaryPolicy: "CITY", updatedAt: settings.updatedAt });
  }
}
