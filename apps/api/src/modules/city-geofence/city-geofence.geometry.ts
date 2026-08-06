import type { GeoJsonPolygon } from "../alert-settings";
import type { CityGeofenceClassification, GeoPoint } from "./city-geofence.types";

// This is a numerical-stability tolerance in longitude/latitude degrees, not a business setting.
export const POINT_ON_SEGMENT_EPSILON = 1e-12;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function validateGeoPoint(value: unknown): GeoPoint | null {
  if (!isPlainObject(value)) return null;
  const { longitude, latitude } = value;
  if (typeof longitude !== "number" || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  if (typeof latitude !== "number" || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
  return Object.freeze({ longitude, latitude });
}

function pointOnSegment(point: GeoPoint, start: readonly [number, number], end: readonly [number, number]): boolean {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.longitude - start[0], point.latitude - start[1]) <= POINT_ON_SEGMENT_EPSILON;

  const pointDx = point.longitude - start[0];
  const pointDy = point.latitude - start[1];
  const t = (pointDx * dx + pointDy * dy) / lengthSquared;
  const clampedT = Math.min(1, Math.max(0, t));
  const closestLongitude = start[0] + clampedT * dx;
  const closestLatitude = start[1] + clampedT * dy;
  return Math.hypot(point.longitude - closestLongitude, point.latitude - closestLatitude) <= POINT_ON_SEGMENT_EPSILON;
}

function pointOnRingBoundary(point: GeoPoint, ring: readonly (readonly [number, number])[]): boolean {
  for (let index = 1; index < ring.length; index += 1) {
    const start = ring[index - 1];
    const end = ring[index];
    if (start !== undefined && end !== undefined && pointOnSegment(point, start, end)) return true;
  }
  return false;
}

function isInsideRing(point: GeoPoint, ring: readonly (readonly [number, number])[]): boolean {
  let inside = false;
  for (let index = 1; index < ring.length; index += 1) {
    const start = ring[index - 1];
    const end = ring[index];
    if (start === undefined || end === undefined) continue;
    const startAbove = start[1] > point.latitude;
    const endAbove = end[1] > point.latitude;
    if (startAbove === endAbove) continue;
    const intersectionLongitude = start[0] + ((point.latitude - start[1]) * (end[0] - start[0])) / (end[1] - start[1]);
    if (point.longitude < intersectionLongitude) inside = !inside;
  }
  return inside;
}

/**
 * Deterministic planar point-in-polygon classification for one city-sized GeoJSON Polygon.
 * Coordinates are [longitude, latitude]; this MVP intentionally does not perform geodesic math.
 */
export function classifyPointInPolygon(polygon: GeoJsonPolygon | null, input: unknown): CityGeofenceClassification {
  const point = validateGeoPoint(input);
  if (point === null) return "INVALID_POINT";
  if (polygon === null) return "UNCONFIGURED";

  for (const ring of polygon.coordinates) if (pointOnRingBoundary(point, ring)) return "BOUNDARY";

  const outerRing = polygon.coordinates[0];
  if (outerRing === undefined || !isInsideRing(point, outerRing)) return "OUTSIDE";
  for (let index = 1; index < polygon.coordinates.length; index += 1) {
    const hole = polygon.coordinates[index];
    if (hole !== undefined && isInsideRing(point, hole)) return "OUTSIDE";
  }
  return "INSIDE";
}
