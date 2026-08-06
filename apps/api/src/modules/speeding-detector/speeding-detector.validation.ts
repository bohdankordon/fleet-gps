import type { NormalizedSpeedingObservation, SpeedingObservationInput } from "./speeding-detector.types";

function parseObservedAt(value: unknown): { readonly value: string; readonly milliseconds: number } | null {
  const date = value instanceof Date ? value : typeof value === "string" ? new Date(value) : null;
  if (date === null || !Number.isFinite(date.getTime())) return null;
  return Object.freeze({ value: date.toISOString(), milliseconds: date.getTime() });
}

export function normalizeSpeedingObservation(input: SpeedingObservationInput): NormalizedSpeedingObservation | null {
  if (typeof input.vehicleId !== "string" || input.vehicleId.trim().length === 0) return null;
  const observedAt = parseObservedAt(input.observedAt);
  if (observedAt === null || typeof input.speedKph !== "number" || !Number.isFinite(input.speedKph) || input.speedKph < 0) return null;
  if (typeof input.latitude !== "number" || !Number.isFinite(input.latitude) || input.latitude < -90 || input.latitude > 90) return null;
  if (typeof input.longitude !== "number" || !Number.isFinite(input.longitude) || input.longitude < -180 || input.longitude > 180) return null;
  return Object.freeze({ vehicleId: input.vehicleId, observedAt: observedAt.value, observedAtMs: observedAt.milliseconds, speedKph: input.speedKph, latitude: input.latitude, longitude: input.longitude });
}

export function safeVehicleId(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function safeObservedAt(value: unknown): string | null {
  return parseObservedAt(value)?.value ?? null;
}
