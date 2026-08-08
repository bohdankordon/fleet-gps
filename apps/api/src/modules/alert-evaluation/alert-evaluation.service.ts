import { Injectable } from "@nestjs/common";
import { AlertEventProcessorService } from "../alert-events";
import type { AlertRulesSettings } from "../alert-settings";
import { InactivityDetectorService } from "../inactivity-detector";
import { SpeedingDetectorService } from "../speeding-detector";
import type { AlertEvaluationDetectionResult, AlertEvaluationObservation, AlertEvaluationResult } from "./alert-evaluation.types";

/**
 * Runs both stateful alert pipelines for one normalized vehicle observation.
 *
 * Callers that need reliable retry semantics must use the durable ingestion layer,
 * which serializes each vehicle and resets/replays detector state after failures.
 */
@Injectable()
export class AlertEvaluationService {
  public constructor(
    private readonly speedingDetector: SpeedingDetectorService,
    private readonly inactivityDetector: InactivityDetectorService,
    private readonly alertEventProcessor: AlertEventProcessorService,
  ) {}

  public async evaluateObservation(observation: AlertEvaluationObservation): Promise<AlertEvaluationResult> {
    const detection = await this.detectObservation(observation);
    const speedingProcessing = await this.alertEventProcessor.processSpeedingResult(detection.speeding);
    const inactivityProcessing = await this.alertEventProcessor.processInactivityResult(detection.inactivity);

    return Object.freeze({
      vehicleId: detection.vehicleId,
      observedAt: detection.observedAt,
      speeding: Object.freeze({ detection: detection.speeding, processing: speedingProcessing }),
      inactivity: Object.freeze({ detection: detection.inactivity, processing: inactivityProcessing }),
    });
  }

  /**
   * Replays an already-processed journal observation through detectors only.
   * This method must never invoke AlertEvent processors or lifecycle persistence.
   */
  public primeObservation(observation: AlertEvaluationObservation, settingsSnapshot?: AlertRulesSettings): Promise<AlertEvaluationDetectionResult> {
    return this.detectObservation(observation, settingsSnapshot);
  }

  private async detectObservation(observation: AlertEvaluationObservation, settingsSnapshot?: AlertRulesSettings): Promise<AlertEvaluationDetectionResult> {
    const speedingDetection = settingsSnapshot === undefined
      ? await this.speedingDetector.detect(observation)
      : this.speedingDetector.detectWithSettings(observation, settingsSnapshot);
    // Speeding validation is authoritative for the complete trust-boundary
    // observation because it validates every shared field, including speedKph.
    // Do not let an invalid full observation advance inactivity timestamp/history.
    const inactivityDetection = speedingDetection.status === "IGNORED" && speedingDetection.reason === "INVALID_OBSERVATION"
      ? this.inactivityDetector.invalidResult(observation)
      : settingsSnapshot === undefined
        ? await this.inactivityDetector.detect(observation)
        : this.inactivityDetector.detectWithSettings(observation, settingsSnapshot);

    return Object.freeze({
      vehicleId: speedingDetection.vehicleId,
      observedAt: speedingDetection.observedAt,
      speeding: speedingDetection,
      inactivity: inactivityDetection,
    });
  }

  public resetVehicle(vehicleId: string): void {
    this.speedingDetector.resetVehicle(vehicleId);
    this.inactivityDetector.resetVehicle(vehicleId);
  }

  public clearAll(): void {
    this.speedingDetector.clearAll();
    this.inactivityDetector.clearAll();
  }
}
