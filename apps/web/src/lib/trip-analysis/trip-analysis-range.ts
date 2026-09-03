import { DateTime } from "luxon";
import type { Dayjs } from "dayjs";
import { parseVehicleTrackRange, type VehicleTrackRange } from "../vehicle-track/vehicle-track-range";

export type TripAnalysisPreset = "TODAY" | "YESTERDAY" | "LAST_24_HOURS" | "LAST_3_DAYS" | "LAST_7_DAYS";
export type InitialTripAnalysisRange = Readonly<{ range: VehicleTrackRange; restoredFromUrl: boolean; openEnded: boolean }>;
export const TRIP_ANALYSIS_PICKER_FORMAT = "DD.MM.YYYY, HH:mm";
export const TRIP_ANALYSIS_CIVIL_FORMAT = "YYYY-MM-DDTHH:mm";
export const TRIP_ANALYSIS_OPEN_END_QUERY_VALUE = "now";

export const TRIP_ANALYSIS_CALENDAR_PRESETS = Object.freeze([
  { key: "TODAY", messageKey: "trips.preset.today", choiceMessageKey: "trips.preset.today" },
  { key: "YESTERDAY", messageKey: "trips.preset.yesterday", choiceMessageKey: "trips.preset.yesterday" },
] as const);

export const TRIP_ANALYSIS_RECENT_PRESETS = Object.freeze([
  { key: "LAST_24_HOURS", messageKey: "trips.preset.last24", choiceMessageKey: "trips.presetChoice.last24" },
  { key: "LAST_3_DAYS", messageKey: "trips.preset.last3", choiceMessageKey: "trips.presetChoice.last3" },
  { key: "LAST_7_DAYS", messageKey: "trips.preset.last7", choiceMessageKey: "trips.presetChoice.last7" },
] as const);

export const TRIP_ANALYSIS_PRESETS = Object.freeze([
  ...TRIP_ANALYSIS_CALENDAR_PRESETS,
  ...TRIP_ANALYSIS_RECENT_PRESETS,
] as const);

export function createTripAnalysisPresetRange(preset: TripAnalysisPreset, now: Date, timezone: string): VehicleTrackRange | null {
  if (!Number.isFinite(now.getTime())) return null;
  const current = DateTime.fromJSDate(now, { zone: "utc" });
  if (preset === "LAST_24_HOURS") return parseVehicleTrackRange(current.minus({ hours: 24 }).toISO(), current.toISO());
  if (preset === "LAST_3_DAYS") return parseVehicleTrackRange(current.minus({ hours: 72 }).toISO(), current.toISO());
  if (preset === "LAST_7_DAYS") return parseVehicleTrackRange(current.minus({ hours: 168 }).toISO(), current.toISO());
  const local = current.setZone(timezone); const day = preset === "TODAY" ? local : local.minus({ days: 1 });
  return parseVehicleTrackRange(day.startOf("day").toUTC().toISO(), (preset === "TODAY" ? current : day.plus({ days: 1 }).startOf("day").toUTC()).toISO());
}

/** Converts picker presentation values to the civil wall-clock contract consumed by the Kyiv parser. */
export function tripAnalysisPickerValueToCivil(value: Dayjs | null): string {
  return value?.isValid() ? value.format(TRIP_ANALYSIS_CIVIL_FORMAT) : "";
}

export function refreshOpenEndedTripAnalysisRange(range: VehicleTrackRange, now: Date): VehicleTrackRange | null {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return null;
  return parseVehicleTrackRange(range.from, now.toISOString());
}

export function tripAnalysisPageQuery(range: VehicleTrackRange, openEnded: boolean): string {
  const query = new URLSearchParams({ from: range.from });
  if (openEnded) query.set("end", TRIP_ANALYSIS_OPEN_END_QUERY_VALUE);
  else query.set("to", range.to);
  return query.toString();
}

/** Resolves complete absolute URLs or an explicit from→now URL; all invalid inputs use Kyiv Today. */
export function resolveInitialTripAnalysisRange(searchParams: Readonly<Record<string, string | string[] | undefined>>, now: Date, timezone: string): InitialTripAnalysisRange | null {
  const from = searchParams.from; const to = searchParams.to;
  const openEnded = searchParams.end === TRIP_ANALYSIS_OPEN_END_QUERY_VALUE && typeof from === "string" && !Array.isArray(searchParams.end)
    ? parseVehicleTrackRange(from, now.toISOString())
    : null;
  if (openEnded) return Object.freeze({ range: openEnded, restoredFromUrl: true, openEnded: true });
  const restored = typeof from === "string" && typeof to === "string" ? parseVehicleTrackRange(from, to) : null;
  if (restored) return Object.freeze({ range: restored, restoredFromUrl: true, openEnded: false });
  const fallback = createTripAnalysisPresetRange("TODAY", now, timezone);
  return fallback ? Object.freeze({ range: fallback, restoredFromUrl: false, openEnded: false }) : null;
}
