import type { FleetMapPositionFreshness } from "./fleet-map-read-models";

export type FleetMapStoredCurrentState = Readonly<{
  fixTime: Date | null;
  latitude: number | null;
  longitude: number | null;
  speedKph: number | null;
  valid: boolean | null;
  outdated: boolean | null;
}>;

export type FleetMapCurrentStateProjection = Readonly<{
  position: Readonly<{ latitude: number; longitude: number; observedAt: string }>;
  speedKph: number | null;
  freshness: FleetMapPositionFreshness;
}>;

function isValidDate(value: Date): boolean {
  return Number.isFinite(value.getTime());
}

export function hasAnyFleetMapPositionData(state: FleetMapStoredCurrentState | null): boolean {
  return state !== null && (state.fixTime !== null || state.latitude !== null || state.longitude !== null);
}

export function projectFleetMapCurrentState(
  state: FleetMapStoredCurrentState | null,
  generatedAt: Date,
  thresholdSeconds: number,
): FleetMapCurrentStateProjection | null {
  if (!state?.fixTime || !isValidDate(state.fixTime)) return null;
  const { latitude, longitude } = state;
  if (latitude === null || longitude === null
    || !Number.isFinite(latitude) || !Number.isFinite(longitude)
    || latitude < -90 || latitude > 90
    || longitude < -180 || longitude > 180) return null;

  const ageMilliseconds = generatedAt.getTime() - state.fixTime.getTime();
  const freshness: FleetMapPositionFreshness = state.valid === true
    && state.outdated === false
    && ageMilliseconds >= 0
    && ageMilliseconds <= thresholdSeconds * 1_000
    ? "FRESH"
    : "STALE";
  const speedKph = state.valid === true
    && state.speedKph !== null
    && Number.isFinite(state.speedKph)
    && state.speedKph >= 0
    ? state.speedKph
    : null;
  return Object.freeze({
    position: Object.freeze({ latitude, longitude, observedAt: state.fixTime.toISOString() }),
    speedKph,
    freshness,
  });
}
