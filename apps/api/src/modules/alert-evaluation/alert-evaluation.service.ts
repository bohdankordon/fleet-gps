import { Injectable } from "@nestjs/common";
import { AlertEventProcessorService } from "../alert-events";
import { InactivityDetectorService } from "../inactivity-detector";
import { SpeedingDetectorService } from "../speeding-detector";
import type { AlertEvaluationObservation, AlertEvaluationResult } from "./alert-evaluation.types";

/**
 * Runs both stateful alert pipelines for one normalized vehicle observation.
 *
 * A future caller must submit observations for the same vehicle sequentially.
 * This service intentionally owns neither a per-vehicle queue nor timestamp state.
 *
 * Detector state advances before persistence. If persistence throws after a state
 * transition, replaying the same observation may be rejected as OUT_OF_ORDER.
 * Recovery/reconciliation belongs to the future ingestion layer; detector state
 * is not rolled back here.
 */
@Injectable()
export class AlertEvaluationService {
  public constructor(
    private readonly speedingDetector: SpeedingDetectorService,
    private readonly inactivityDetector: InactivityDetectorService,
    private readonly alertEventProcessor: AlertEventProcessorService,
  ) {}

  public async evaluateObservation(observation: AlertEvaluationObservation): Promise<AlertEvaluationResult> {
    const speedingDetection = await this.speedingDetector.detect(observation);
    const speedingProcessing = await this.alertEventProcessor.processSpeedingResult(speedingDetection);
    // Speeding validation is authoritative for the complete trust-boundary
    // observation because it validates every shared field, including speedKph.
    // Do not let an invalid full observation advance inactivity timestamp/history.
    const inactivityDetection = speedingDetection.status === "IGNORED" && speedingDetection.reason === "INVALID_OBSERVATION"
      ? this.inactivityDetector.invalidResult(observation)
      : await this.inactivityDetector.detect(observation);
    const inactivityProcessing = await this.alertEventProcessor.processInactivityResult(inactivityDetection);

    return Object.freeze({
      vehicleId: speedingDetection.vehicleId,
      observedAt: speedingDetection.observedAt,
      speeding: Object.freeze({ detection: speedingDetection, processing: speedingProcessing }),
      inactivity: Object.freeze({ detection: inactivityDetection, processing: inactivityProcessing }),
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
