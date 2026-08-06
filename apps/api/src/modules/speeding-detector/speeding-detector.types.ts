import type { SpeedLimitZone } from "../city-geofence";

export type SpeedingDetectorStatus = "IGNORED" | "CLEAR" | "PENDING" | "CONFIRMED" | "ACTIVE";

export type SpeedingDetectorReason = "BELOW_OR_EQUAL_THRESHOLD" | "ABOVE_THRESHOLD" | "RULE_DISABLED" | "UNKNOWN_ZONE" | "INVALID_OBSERVATION" | "OUT_OF_ORDER" | "RULE_CONTEXT_CHANGED";

/** Deliberately accepts unknown values: observations can arrive from an untrusted sync boundary. */
export type SpeedingObservationInput = Readonly<{
  vehicleId: unknown;
  observedAt: unknown;
  speedKph: unknown;
  latitude: unknown;
  longitude: unknown;
}>;

export type NormalizedSpeedingObservation = Readonly<{
  vehicleId: string;
  observedAt: string;
  observedAtMs: number;
  speedKph: number;
  latitude: number;
  longitude: number;
}>;

export type SpeedingRuleContext = Readonly<{
  ruleEnabled: boolean;
  zone: SpeedLimitZone;
  thresholdKph: number | null;
  confirmationRequired: number;
}>;

export type SpeedingDetectionResult = Readonly<{
  vehicleId: string;
  observedAt: string | null;
  status: SpeedingDetectorStatus;
  reason: SpeedingDetectorReason;
  zone: SpeedLimitZone;
  speedKph: number | null;
  thresholdKph: number | null;
  consecutiveCount: number;
  confirmationRequired: number;
  newlyConfirmed: boolean;
}>;
