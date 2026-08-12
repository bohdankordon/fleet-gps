import { DateTime } from "luxon";
import { VEHICLE_TRACK_INPUT_TIMEZONE } from "../vehicle-track/vehicle-track-custom-range";
import { parseVehicleTrackRange, type VehicleTrackRange } from "../vehicle-track/vehicle-track-range";

export type TripAnalysisPreset = "TODAY" | "YESTERDAY" | "LAST_24_HOURS" | "LAST_7_DAYS";
export type InitialTripAnalysisRange = Readonly<{ range: VehicleTrackRange; restoredFromUrl: boolean }>;
export const TRIP_ANALYSIS_PRESETS = Object.freeze([{ key: "TODAY", label: "Сегодня" }, { key: "YESTERDAY", label: "Вчера" }, { key: "LAST_24_HOURS", label: "Последние 24 часа" }, { key: "LAST_7_DAYS", label: "Последние 7 дней" }] as const);

export function createTripAnalysisPresetRange(preset: TripAnalysisPreset, now: Date): VehicleTrackRange | null {
  if (!Number.isFinite(now.getTime())) return null;
  const current = DateTime.fromJSDate(now, { zone: "utc" });
  if (preset === "LAST_24_HOURS") return parseVehicleTrackRange(current.minus({ hours: 24 }).toISO(), current.toISO());
  if (preset === "LAST_7_DAYS") return parseVehicleTrackRange(current.minus({ days: 7 }).toISO(), current.toISO());
  const local = current.setZone(VEHICLE_TRACK_INPUT_TIMEZONE); const day = preset === "TODAY" ? local : local.minus({ days: 1 });
  return parseVehicleTrackRange(day.startOf("day").toUTC().toISO(), (preset === "TODAY" ? current : day.plus({ days: 1 }).startOf("day").toUTC()).toISO());
}

/** Resolves only a complete, strict absolute URL range; all other inputs use Kyiv Today. */
export function resolveInitialTripAnalysisRange(searchParams: Readonly<Record<string, string | string[] | undefined>>, now: Date): InitialTripAnalysisRange | null {
  const from = searchParams.from; const to = searchParams.to;
  const restored = typeof from === "string" && typeof to === "string" ? parseVehicleTrackRange(from, to) : null;
  if (restored) return Object.freeze({ range: restored, restoredFromUrl: true });
  const fallback = createTripAnalysisPresetRange("TODAY", now);
  return fallback ? Object.freeze({ range: fallback, restoredFromUrl: false }) : null;
}
