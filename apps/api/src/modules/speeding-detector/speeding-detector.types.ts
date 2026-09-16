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
  settingsFingerprint: string;
}>;

export type SpeedingStreakStart = Readonly<{
  observedAt: string;
  latitude: number;
  longitude: number;
}>;

export type SpeedingDetectorCheckpoint = Readonly<{
  vehicleId: string;
  lastAcceptedObservedAt: string;
  settingsFingerprint: string;
  context: Readonly<{ zone: "CITY" | "OUTSIDE_CITY"; thresholdKph: number; confirmationRequired: number }> | null;
  consecutiveCount: number;
  confirmed: boolean;
  streakStart: SpeedingStreakStart | null;
  confirmationObservedAt: string | null;
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
  /** Present only on the normalized observation that newly confirms SPEEDING. */
  confirmationPosition?: Readonly<{ latitude: number; longitude: number }>;
  /** Present on CONFIRMED/ACTIVE and identifies the exact confirmation receipt. */
  confirmationObservedAt?: string;
  /** Present only when an observation newly confirms a streak. */
  streakStart?: SpeedingStreakStart;
  /** Present on CONFIRMED/ACTIVE so persistence can advance exact evidence. */
  speedingPosition?: Readonly<{ latitude: number; longitude: number }>;
}>;
