export const TRIP_STOP_ANALYTICS_MAX_RANGE_MS = 7 * 24 * 60 * 60 * 1_000;
export const TRIP_STOP_ANALYTICS_MAX_DURATION_SECONDS = TRIP_STOP_ANALYTICS_MAX_RANGE_MS / 1_000;
export type TripStopAnalyticsPolicy = Readonly<{ tripMovementSpeedKph: number; tripMovementConfirmationSeconds: number; tripStopConfirmationSeconds: number; tripDataGapSeconds: number }>;
export const DEFAULT_TRIP_STOP_ANALYTICS_POLICY: TripStopAnalyticsPolicy = Object.freeze({ tripMovementSpeedKph: 5, tripMovementConfirmationSeconds: 60, tripStopConfirmationSeconds: 300, tripDataGapSeconds: 300 });

export function validateTripStopAnalyticsPolicy(value: Readonly<Record<string, unknown>>): TripStopAnalyticsPolicy {
  const integer = (candidate: unknown, minimum: number, maximum: number): number => {
    if (typeof candidate !== "number" || !Number.isFinite(candidate) || !Number.isInteger(candidate) || candidate < minimum || candidate > maximum) throw new Error("Invalid trip/stop policy");
    return candidate;
  };
  return Object.freeze({ tripMovementSpeedKph: integer(value.tripMovementSpeedKph, 1, 200), tripMovementConfirmationSeconds: integer(value.tripMovementConfirmationSeconds, 1, TRIP_STOP_ANALYTICS_MAX_DURATION_SECONDS), tripStopConfirmationSeconds: integer(value.tripStopConfirmationSeconds, 1, TRIP_STOP_ANALYTICS_MAX_DURATION_SECONDS), tripDataGapSeconds: integer(value.tripDataGapSeconds, 1, TRIP_STOP_ANALYTICS_MAX_DURATION_SECONDS) });
}
