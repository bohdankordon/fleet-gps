import { Injectable } from "@nestjs/common";
import { AlertSettingsService } from "../alert-settings";
import { CityGeofenceService } from "../city-geofence";
import type { SpeedingDetectionResult, SpeedingObservationInput, SpeedingRuleContext } from "./speeding-detector.types";
import { normalizeSpeedingObservation } from "./speeding-detector.validation";
import { SpeedingDetectorStateMachine } from "./speeding-detector.state-machine";

@Injectable()
export class SpeedingDetectorService {
  public constructor(private readonly alertSettings: AlertSettingsService, private readonly cityGeofence: CityGeofenceService, private readonly stateMachine: SpeedingDetectorStateMachine) {}

  public async detect(input: SpeedingObservationInput): Promise<SpeedingDetectionResult> {
    const observation = normalizeSpeedingObservation(input);
    if (observation === null) return this.stateMachine.invalidResult(input);
    const settings = await this.alertSettings.getSettings();
    const geofence = this.cityGeofence.classifyPointWithSettings({ latitude: observation.latitude, longitude: observation.longitude }, settings);
    const context: SpeedingRuleContext = Object.freeze({
      ruleEnabled: settings.speedRuleEnabled,
      zone: geofence.speedLimitZone,
      thresholdKph: geofence.speedLimitZone === "CITY" ? settings.effectiveSpeedThresholds.cityKph : geofence.speedLimitZone === "OUTSIDE_CITY" ? settings.effectiveSpeedThresholds.outsideCityKph : null,
      confirmationRequired: settings.speedingConfirmationUpdates,
    });
    return this.stateMachine.detect(input, context);
  }

  public resetVehicle(vehicleId: string): void { this.stateMachine.resetVehicle(vehicleId); }
  public clearAll(): void { this.stateMachine.clearAll(); }
  public stateCount(): number { return this.stateMachine.stateCount(); }
}
