export type InactivityDetectorStatus = "IGNORED" | "COLLECTING" | "CLEAR" | "CONFIRMED" | "ACTIVE";

export type InactivityDetectorReason =
  | "INVALID_OBSERVATION"
  | "OUT_OF_ORDER"
  | "RULE_DISABLED"
  | "WINDOW_STARTED"
  | "WINDOW_INCOMPLETE"
  | "DATA_GAP"
  | "RULE_CONTEXT_CHANGED"
  | "DISTANCE_THRESHOLD_REACHED"
  | "INACTIVITY_CONFIRMED"
  | "INACTIVITY_ACTIVE";

/** Deliberately accepts unknown values because observations arrive at a trust boundary. */
export type InactivityObservationInput = Readonly<{
  vehicleId: unknown;
  observedAt: unknown;
  latitude: unknown;
  longitude: unknown;
}>;

export type NormalizedInactivityObservation = Readonly<{
  vehicleId: string;
  observedAt: string;
  observedAtMs: number;
  latitude: number;
  longitude: number;
}>;

export type InactivityRuleContext = Readonly<{
  ruleEnabled: boolean;
  distanceThresholdMeters: number;
  durationThresholdMinutes: number;
}>;

export type InactivityDetectionResult = Readonly<{
  vehicleId: string;
  observedAt: string | null;
  status: InactivityDetectorStatus;
  reason: InactivityDetectorReason;
  elapsedMinutes: number | null;
  traveledDistanceMeters: number | null;
  distanceThresholdMeters: number | null;
  durationThresholdMinutes: number | null;
  windowPointCount: number;
  newlyConfirmed: boolean;
}>;
