import type { NormalizedInactivityObservation } from "./inactivity-detector.types";

const EARTH_RADIUS_METERS = 6_371_000;

function toRadians(value: number): number {
  return value * Math.PI / 180;
}

/** Returns the geodesic segment length in meters; inputs are already coordinate-validated. */
export function haversineDistanceMeters(from: Pick<NormalizedInactivityObservation, "latitude" | "longitude">, to: Pick<NormalizedInactivityObservation, "latitude" | "longitude">): number {
  const latitudeDelta = toRadians(to.latitude - from.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const latitude1 = toRadians(from.latitude);
  const latitude2 = toRadians(to.latitude);
  const sinLatitude = Math.sin(latitudeDelta / 2);
  const sinLongitude = Math.sin(longitudeDelta / 2);
  const haversine = sinLatitude * sinLatitude + Math.cos(latitude1) * Math.cos(latitude2) * sinLongitude * sinLongitude;
  const clamped = Math.min(1, Math.max(0, haversine));
  const distance = EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(clamped), Math.sqrt(1 - clamped));
  return Number.isFinite(distance) && distance >= 0 ? distance : 0;
}
