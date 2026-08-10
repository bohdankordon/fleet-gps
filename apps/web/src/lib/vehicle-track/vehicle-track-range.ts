export const VEHICLE_TRACK_DEFAULT_HOURS = 6;
export const VEHICLE_TRACK_MAX_RANGE_MS = 24 * 60 * 60 * 1_000;
export const VEHICLE_TRACK_PRESETS = Object.freeze([{ hours: 1, label: "Последний час" }, { hours: 6, label: "6 часов" }, { hours: 24, label: "24 часа" }] as const);

export type VehicleTrackRange = Readonly<{ from: string; to: string }>;
export type InitialVehicleTrackRange = Readonly<{ range: VehicleTrackRange | null; defaulted: boolean }>;

const absoluteTimestampPattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|([+-])(\d{2}):(\d{2}))$/;

function daysInMonth(year: number, month: number): number {
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0;
}

export function parseVehicleTrackTimestamp(value: unknown): Date | null {
  const match = typeof value === "string" ? absoluteTimestampPattern.exec(value) : null;
  if (!match) return null;
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3]);
  const hour = Number(match[4]); const minute = Number(match[5]); const second = Number(match[6]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month) || hour > 23 || minute > 59 || second > 59) return null;
  if (match[7] !== "Z") {
    const offsetHour = Number(match[9]); const offsetMinute = Number(match[10]);
    if (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) return null;
  }
  const parsed = Date.parse(match[0]);
  return Number.isFinite(parsed) ? new Date(parsed) : null;
}

export function parseVehicleTrackRange(fromValue: unknown, toValue: unknown): VehicleTrackRange | null {
  const from = parseVehicleTrackTimestamp(fromValue); const to = parseVehicleTrackTimestamp(toValue);
  if (!from || !to) return null;
  const duration = to.getTime() - from.getTime();
  return duration > 0 && duration <= VEHICLE_TRACK_MAX_RANGE_MS ? Object.freeze({ from: from.toISOString(), to: to.toISOString() }) : null;
}

export function createVehicleTrackPresetRange(hours: 1 | 6 | 24, now: Date): VehicleTrackRange | null {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return null;
  return Object.freeze({ from: new Date(now.getTime() - hours * 60 * 60 * 1_000).toISOString(), to: now.toISOString() });
}

export function resolveInitialVehicleTrackRange(searchParams: Readonly<Record<string, string | string[] | undefined>>, now: Date): InitialVehicleTrackRange {
  const rawFrom = searchParams.from; const rawTo = searchParams.to;
  if (rawFrom === undefined && rawTo === undefined) return Object.freeze({ range: createVehicleTrackPresetRange(VEHICLE_TRACK_DEFAULT_HOURS, now), defaulted: true });
  return Object.freeze({ range: parseVehicleTrackRange(rawFrom, rawTo), defaulted: false });
}

export function vehicleTrackRangeKey(range: VehicleTrackRange): string { return `${range.from}/${range.to}`; }
