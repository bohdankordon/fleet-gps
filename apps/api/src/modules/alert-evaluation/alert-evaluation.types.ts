import type { InactivityDetectionResult } from "../inactivity-detector";
import type { InactivityAlertEventProcessingResult, SpeedingAlertEventProcessingResult } from "../alert-events";
import type { SpeedingDetectionResult, SpeedingObservationInput } from "../speeding-detector";

/**
 * Minimal observation accepted from a normalized upstream boundary.
 * The unknown field types deliberately preserve the detectors' validation semantics.
 */
export type AlertEvaluationObservation = SpeedingObservationInput;

export type AlertEvaluationResult = Readonly<{
  vehicleId: string;
  observedAt: string | null;
  speeding: Readonly<{
    detection: SpeedingDetectionResult;
    processing: SpeedingAlertEventProcessingResult;
  }>;
  inactivity: Readonly<{
    detection: InactivityDetectionResult;
    processing: InactivityAlertEventProcessingResult;
  }>;
}>;
