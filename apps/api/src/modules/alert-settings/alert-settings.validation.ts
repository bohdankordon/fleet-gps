import { AlertSettingsStateError, type GeoJsonPolygon } from "./alert-settings.types";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function integerInRange(value: unknown, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value < minimum || value > maximum) throw new AlertSettingsStateError("invalid");
  return value;
}

export function validatePositionFreshnessSeconds(value: unknown): number { return integerInRange(value, 1, 86_400); }
export function validateMinimumDailyDistanceMeters(value: unknown): number { return integerInRange(value, 0, 10_000_000); }
export function validateRevision(value: unknown): number { return integerInRange(value, 1, 2_147_483_647); }

export function validateTimezone(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new AlertSettingsStateError("invalid");
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: value }).format(new Date(0));
    return value;
  } catch {
    throw new AlertSettingsStateError("invalid");
  }
}

export function validateGeoJsonPolygon(value: unknown): GeoJsonPolygon | null {
  if (value === null) return null;
  if (!isPlainObject(value) || value.type !== "Polygon" || !Array.isArray(value.coordinates) || value.coordinates.length === 0) throw new AlertSettingsStateError("invalid");

  const coordinates: [number, number][][] = value.coordinates.map((rawRing) => {
    if (!Array.isArray(rawRing) || rawRing.length < 4) throw new AlertSettingsStateError("invalid");
    const ring = rawRing.map((rawPosition) => {
      if (!Array.isArray(rawPosition) || rawPosition.length !== 2) throw new AlertSettingsStateError("invalid");
      const longitude = rawPosition[0];
      const latitude = rawPosition[1];
      if (typeof longitude !== "number" || !Number.isFinite(longitude) || longitude < -180 || longitude > 180 || typeof latitude !== "number" || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) throw new AlertSettingsStateError("invalid");
      return [longitude, latitude] as [number, number];
    });
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first === undefined || last === undefined || first[0] !== last[0] || first[1] !== last[1]) throw new AlertSettingsStateError("invalid");
    return ring;
  });

  return deepFreeze({ type: "Polygon", coordinates });
}

export function validateSpeedSettings(value: Readonly<Record<string, unknown>>): Readonly<{ citySpeedLimitKph: number; outsideCitySpeedLimitKph: number; speedToleranceKph: number; speedingConfirmationUpdates: number; cityThreshold: number; outsideThreshold: number }> {
  const citySpeedLimitKph = integerInRange(value.citySpeedLimitKph, 1, 200);
  const outsideCitySpeedLimitKph = integerInRange(value.outsideCitySpeedLimitKph, 1, 200);
  const speedToleranceKph = integerInRange(value.speedToleranceKph, 0, 50);
  const speedingConfirmationUpdates = integerInRange(value.speedingConfirmationUpdates, 1, 10);
  const cityThreshold = citySpeedLimitKph + speedToleranceKph;
  const outsideThreshold = outsideCitySpeedLimitKph + speedToleranceKph;
  if (!Number.isFinite(cityThreshold) || !Number.isFinite(outsideThreshold) || cityThreshold > 250 || outsideThreshold > 250) throw new AlertSettingsStateError("invalid");
  return deepFreeze({ citySpeedLimitKph, outsideCitySpeedLimitKph, speedToleranceKph, speedingConfirmationUpdates, cityThreshold, outsideThreshold });
}

export function validateInactivitySettings(value: Readonly<Record<string, unknown>>): Readonly<{ inactivityDistanceMeters: number; inactivityDurationMinutes: number }> {
  return deepFreeze({ inactivityDistanceMeters: integerInRange(value.inactivityDistanceMeters, 0, 5_000), inactivityDurationMinutes: integerInRange(value.inactivityDurationMinutes, 1, 1_440) });
}

export function validateRuleEnabled(value: unknown): boolean {
  if (typeof value !== "boolean") throw new AlertSettingsStateError("invalid");
  return value;
}

export function validateUpdatedAt(value: unknown): string {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new AlertSettingsStateError("invalid");
  return value.toISOString();
}
