import { Injectable } from "@nestjs/common";
import { AlertSettingsService, type AlertRulesSettings } from "../alert-settings";
import type { InactivityDetectionResult, InactivityObservationInput, InactivityRuleContext } from "./inactivity-detector.types";
import { InactivityDetectorStateMachine } from "./inactivity-detector.state-machine";
import { normalizeInactivityObservation } from "./inactivity-detector.validation";

@Injectable()
export class InactivityDetectorService {
  public constructor(private readonly alertSettings: AlertSettingsService, private readonly stateMachine: InactivityDetectorStateMachine) {}

  public async detect(input: InactivityObservationInput): Promise<InactivityDetectionResult> {
    if (normalizeInactivityObservation(input) === null) return this.stateMachine.invalidResult(input);
    const settings = await this.alertSettings.getSettings();
    return this.detectWithSettings(input, settings);
  }

  /** Uses an explicit current snapshot for deterministic detector-only replay. */
  public detectWithSettings(input: InactivityObservationInput, settings: AlertRulesSettings): InactivityDetectionResult {
    if (normalizeInactivityObservation(input) === null) return this.stateMachine.invalidResult(input);
    const context: InactivityRuleContext = Object.freeze({
      ruleEnabled: settings.inactivityRuleEnabled,
      distanceThresholdMeters: settings.inactivityDistanceMeters,
      durationThresholdMinutes: settings.inactivityDurationMinutes,
    });
    return this.stateMachine.detect(input, context);
  }

  /** Returns the detector's canonical invalid result without accepting state. */
  public invalidResult(input: InactivityObservationInput): InactivityDetectionResult { return this.stateMachine.invalidResult(input); }
  public resetVehicle(vehicleId: string): void { this.stateMachine.resetVehicle(vehicleId); }
  public clearAll(): void { this.stateMachine.clearAll(); }
  public stateCount(): number { return this.stateMachine.stateCount(); }
}
