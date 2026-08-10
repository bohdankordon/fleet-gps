import type { EquGpsPosition } from "@taxi-gps/equgps";
import type { PositionHistoryNormalizationInput } from "./position-history-normalization";

export type EquGpsPositionTime = Readonly<{ value: Date | null; invalid: boolean }>;

const explicitTimezone = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/i;

export function parseEquGpsPositionTime(value: string | null): EquGpsPositionTime {
  if (value === null) return { value: null, invalid: false };
  const match = explicitTimezone.exec(value);
  if (!match) return { value: null, invalid: true };
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) return { value: null, invalid: true };
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return { value: null, invalid: true };
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? { value: null, invalid: true } : { value: date, invalid: false };
}

export function mapEquGpsPositionToHistoryInput(position: EquGpsPosition, fetchedAt: Date): Omit<PositionHistoryNormalizationInput, "ingestionSource"> {
  const observedAt = parseEquGpsPositionTime(position.fixTime).value;
  const coordinates = Number.isFinite(position.latitude) && Number.isFinite(position.longitude)
    && position.latitude !== null && position.longitude !== null
    && position.latitude >= -90 && position.latitude <= 90
    && position.longitude >= -180 && position.longitude <= 180
    ? { latitude: position.latitude, longitude: position.longitude }
    : { latitude: null, longitude: null };
  const speedKph = position.speedKnots !== null && Number.isFinite(position.speedKnots) && position.speedKnots >= 0
    ? position.speedKnots * 1.852
    : null;
  return Object.freeze({ observedAt, ...coordinates, speedKph, valid: position.valid, outdated: position.outdated, fetchedAt: new Date(fetchedAt.getTime()) });
}
