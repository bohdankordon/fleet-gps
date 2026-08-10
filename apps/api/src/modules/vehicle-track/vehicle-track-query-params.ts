export const VEHICLE_TRACK_MAX_RANGE_MS = 24 * 60 * 60 * 1_000;

export type VehicleTrackRange = Readonly<{ from: Date; to: Date }>;

const absoluteTimestampPattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|([+-])(\d{2}):(\d{2}))$/;

function daysInMonth(year: number, month: number): number {
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0;
}

export function parseAbsoluteTimestamp(value: unknown): Date | null {
  const match = typeof value === "string" ? absoluteTimestampPattern.exec(value) : null;
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month) || hour > 23 || minute > 59 || second > 59) return null;
  if (match[7] !== "Z") {
    const offsetHour = Number(match[9]);
    const offsetMinute = Number(match[10]);
    if (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) return null;
  }
  const timestamp = Date.parse(match[0]);
  return Number.isFinite(timestamp) ? new Date(timestamp) : null;
}

export function parseVehicleTrackRange(rawFrom: unknown, rawTo: unknown): VehicleTrackRange | null {
  const from = parseAbsoluteTimestamp(rawFrom);
  const to = parseAbsoluteTimestamp(rawTo);
  if (!from || !to) return null;
  const duration = to.getTime() - from.getTime();
  return duration > 0 && duration <= VEHICLE_TRACK_MAX_RANGE_MS ? Object.freeze({ from, to }) : null;
}
