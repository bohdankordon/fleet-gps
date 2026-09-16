import { Injectable, Optional } from "@nestjs/common";
import { AlertSettingsService, SettingsChangeNotifier, type AlertRulesSettings } from "../alert-settings";
import { CityGeofenceService } from "../city-geofence";
import type { SpeedingDetectionResult, SpeedingDetectorCheckpoint, SpeedingObservationInput, SpeedingRuleContext } from "./speeding-detector.types";
import { normalizeSpeedingObservation } from "./speeding-detector.validation";
import { SpeedingDetectorStateMachine } from "./speeding-detector.state-machine";
import { createSpeedingSettingsFingerprint } from "./speeding-settings-fingerprint";

@Injectable()
export class SpeedingDetectorService {
  public constructor(private readonly alertSettings: AlertSettingsService, private readonly cityGeofence: CityGeofenceService, private readonly stateMachine: SpeedingDetectorStateMachine, @Optional() notifier?: SettingsChangeNotifier) { notifier?.subscribe((changes) => { if (changes.has("speeding")) this.stateMachine.invalidateContextsPreservingOrdering(); }); }

  public async detect(input: SpeedingObservationInput): Promise<SpeedingDetectionResult> {
    const observation = normalizeSpeedingObservation(input);
    if (observation === null) return this.stateMachine.invalidResult(input);
    const settings = await this.alertSettings.getSettings();
    return this.detectValidated(input, observation, settings);
  }

  private detectValidated(input: SpeedingObservationInput, observation: NonNullable<ReturnType<typeof normalizeSpeedingObservation>>, settings: AlertRulesSettings): SpeedingDetectionResult {
    const geofence = this.cityGeofence.classifyPointWithSettings({ latitude: observation.latitude, longitude: observation.longitude }, settings);
    const context: SpeedingRuleContext = Object.freeze({
      ruleEnabled: settings.speedRuleEnabled,
      zone: geofence.speedLimitZone,
      thresholdKph: geofence.speedLimitZone === "CITY" ? settings.effectiveSpeedThresholds.cityKph : geofence.speedLimitZone === "OUTSIDE_CITY" ? settings.effectiveSpeedThresholds.outsideCityKph : null,
      confirmationRequired: settings.speedingConfirmationUpdates,
      settingsFingerprint: createSpeedingSettingsFingerprint(settings),
    });
    return this.stateMachine.detect(input, context);
  }

  public resetVehicle(vehicleId: string): void { this.stateMachine.resetVehicle(vehicleId); }
  public clearAll(): void { this.stateMachine.clearAll(); }
  public stateCount(): number { return this.stateMachine.stateCount(); }
  public seedOrderingFrontier(vehicleId: string, observedAt: Date, settings: AlertRulesSettings): void { this.stateMachine.seedOrderingFrontier(vehicleId, observedAt, createSpeedingSettingsFingerprint(settings)); }
  public hydrate(checkpoint: SpeedingDetectorCheckpoint): void { this.stateMachine.hydrate(checkpoint); }
  public checkpoint(vehicleId: string): SpeedingDetectorCheckpoint | null { return this.stateMachine.checkpoint(vehicleId); }
}
