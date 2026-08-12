import { DateTime } from "luxon";
import { VEHICLE_TRACK_INPUT_TIMEZONE } from "../vehicle-track/vehicle-track-custom-range";
import type { VehicleTrackRange } from "../vehicle-track/vehicle-track-range";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export type FleetActivityReportDate = Readonly<{ date: string; range: VehicleTrackRange; defaulted: boolean }>;

function validDate(value: unknown): string | null { if (typeof value !== "string" || !DATE_PATTERN.test(value)) return null; const parsed = DateTime.fromISO(value, { zone: VEHICLE_TRACK_INPUT_TIMEZONE }); return parsed.isValid && parsed.toISODate() === value ? value : null; }
export function currentKyivDate(now: Date): string | null { if (!Number.isFinite(now.getTime())) return null; return DateTime.fromJSDate(now, { zone: "utc" }).setZone(VEHICLE_TRACK_INPUT_TIMEZONE).toISODate(); }
export function resolveFleetActivityReportDateRange(date: string, now: Date): VehicleTrackRange | null { const selected = validDate(date); const today = currentKyivDate(now); if (!selected || !today) return null; const start = DateTime.fromISO(selected, { zone: VEHICLE_TRACK_INPUT_TIMEZONE }).startOf("day"); const current = DateTime.fromJSDate(now, { zone: "utc" }); const end = selected === today ? current : start.plus({ days: 1 }); return end.toMillis() > start.toMillis() ? Object.freeze({ from: start.toUTC().toISO()!, to: end.toUTC().toISO()! }) : null; }
export function resolveInitialFleetActivityReportDate(searchParams: Readonly<Record<string, string | string[] | undefined>>, now: Date): FleetActivityReportDate | null { const today = currentKyivDate(now); if (!today) return null; const raw = searchParams.date; const restored = validDate(raw); const date = restored ?? today; const range = resolveFleetActivityReportDateRange(date, now); return range ? Object.freeze({ date, range, defaulted: restored === null }) : null; }
export function previousKyivDate(now: Date): string | null { const today = currentKyivDate(now); return today ? DateTime.fromISO(today, { zone: VEHICLE_TRACK_INPUT_TIMEZONE }).minus({ days: 1 }).toISODate() : null; }
