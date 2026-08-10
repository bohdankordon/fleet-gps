import { Inject, Injectable, Optional } from "@nestjs/common";
import { AlertSettingsService } from "../alert-settings";
import { AlertSettingsStateError } from "../alert-settings/alert-settings.types";
import { classifyPointInPolygon } from "./city-geofence.geometry";
import { classifySpeedLimitZone } from "./city-geofence.policy";
import { CITY_GEOFENCE_CLOCK } from "./city-geofence.tokens";
import type { AlertRulesSettings } from "../alert-settings";
import type { CityGeofenceClock, CityGeofenceDiagnostic, CityGeofenceMapResponse, CityGeofenceResult, GeoPoint } from "./city-geofence.types";

const systemClock: CityGeofenceClock = Object.freeze({ now: () => new Date() });

@Injectable()
export class CityGeofenceService {
  public constructor(
    private readonly alertSettings: AlertSettingsService,
    @Optional() @Inject(CITY_GEOFENCE_CLOCK) private readonly clock: CityGeofenceClock = systemClock,
  ) {}

  public async classifyPoint(point: GeoPoint): Promise<CityGeofenceResult> {
    const settings = await this.alertSettings.getSettings();
    return this.classifyPointWithSettings(point, settings);
  }

  /**
   * Classifies a point using a caller-owned immutable settings snapshot.
   * This keeps consumers that need both thresholds and a zone on one revision
   * of the configured geofence without exposing its geometry in the result.
   */
  public classifyPointWithSettings(point: GeoPoint, settings: AlertRulesSettings): CityGeofenceResult {
    const classification = classifyPointInPolygon(settings.cityGeofence.geometry, point);
    return Object.freeze({ classification, speedLimitZone: classifySpeedLimitZone(classification), geofenceConfigured: settings.cityGeofence.configured });
  }

  public async getDiagnostic(): Promise<CityGeofenceDiagnostic> {
    const settings = await this.alertSettings.getSettings();
    return Object.freeze({ configured: settings.cityGeofence.configured, classificationAvailable: settings.cityGeofence.configured, boundaryPolicy: "CITY", updatedAt: settings.updatedAt });
  }

  public async getMapProjection(): Promise<CityGeofenceMapResponse> {
    const settings = await this.alertSettings.getSettings();
    const generatedAt = this.clock.now();
    if (!(generatedAt instanceof Date) || !Number.isFinite(generatedAt.getTime())) throw new AlertSettingsStateError("invalid");
    return Object.freeze({ generatedAt: generatedAt.toISOString(), configured: settings.cityGeofence.configured, geometry: settings.cityGeofence.geometry });
  }
}
