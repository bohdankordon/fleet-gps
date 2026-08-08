export const POSITION_FUTURE_SKEW_MS = 60_000;

export function isBeyondAllowedPositionFutureSkew(observedAt: Date, referenceAt: Date): boolean {
  return observedAt.getTime() - referenceAt.getTime() > POSITION_FUTURE_SKEW_MS;
}
