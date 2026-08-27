import { DateTime } from "luxon";
import { parseVehicleTrackRange, type VehicleTrackRange } from "../vehicle-track/vehicle-track-range";

export type TripAnalysisPreset = "TODAY" | "YESTERDAY" | "LAST_24_HOURS" | "LAST_7_DAYS";
export type InitialTripAnalysisRange = Readonly<{ range: VehicleTrackRange; restoredFromUrl: boolean }>;
export const TRIP_ANALYSIS_PRESETS = Object.freeze([{ key: "TODAY", messageKey: "trips.preset.today" }, { key: "YESTERDAY", messageKey: "trips.preset.yesterday" }, { key: "LAST_24_HOURS", messageKey: "trips.preset.last24" }, { key: "LAST_7_DAYS", messageKey: "trips.preset.last7" }] as const);

export function createTripAnalysisPresetRange(preset: TripAnalysisPreset, now: Date, timezone: string): VehicleTrackRange | null {
  if (!Number.isFinite(now.getTime())) return null;
  const current = DateTime.fromJSDate(now, { zone: "utc" });
  if (preset === "LAST_24_HOURS") return parseVehicleTrackRange(current.minus({ hours: 24 }).toISO(), current.toISO());
  if (preset === "LAST_7_DAYS") return parseVehicleTrackRange(current.minus({ days: 7 }).toISO(), current.toISO());
  const local = current.setZone(timezone); const day = preset === "TODAY" ? local : local.minus({ days: 1 });
  return parseVehicleTrackRange(day.startOf("day").toUTC().toISO(), (preset === "TODAY" ? current : day.plus({ days: 1 }).startOf("day").toUTC()).toISO());
}

/** Resolves only a complete, strict absolute URL range; all other inputs use Kyiv Today. */
export function resolveInitialTripAnalysisRange(searchParams: Readonly<Record<string, string | string[] | undefined>>, now: Date, timezone: string): InitialTripAnalysisRange | null {
  const from = searchParams.from; const to = searchParams.to;
  const restored = typeof from === "string" && typeof to === "string" ? parseVehicleTrackRange(from, to) : null;
  if (restored) return Object.freeze({ range: restored, restoredFromUrl: true });
  const fallback = createTripAnalysisPresetRange("TODAY", now, timezone);
  return fallback ? Object.freeze({ range: fallback, restoredFromUrl: false }) : null;
}
