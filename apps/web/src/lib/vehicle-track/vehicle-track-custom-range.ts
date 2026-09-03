import { DateTime } from "luxon";
import { parseVehicleTrackRange, type VehicleTrackRange } from "./vehicle-track-range";
import { translate } from "../../i18n/core";
import { DEFAULT_LOCALE, type AppLocale } from "../../i18n/locales";

/** Legacy explicit-absolute-input contract, not business-calendar policy. */
export const VEHICLE_TRACK_INPUT_TIMEZONE = "Europe/Kyiv";
export type VehicleTrackDraftRange = Readonly<{ from: string; to: string }>;
export type VehicleTrackCustomRangeError = "REQUIRED" | "INVALID" | "NONEXISTENT" | "AMBIGUOUS" | "ORDER" | "TOO_LONG";
export type VehicleTrackCustomRangeResult = Readonly<{ range: VehicleTrackRange | null; error: VehicleTrackCustomRangeError | null }>;

const localDateTimePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export function vehicleTrackRangeToKyivDraft(range: VehicleTrackRange | null): VehicleTrackDraftRange {
  if (!range) return Object.freeze({ from: "", to: "" });
  return Object.freeze({ from: absoluteToKyivLocal(range.from) ?? "", to: absoluteToKyivLocal(range.to) ?? "" });
}

export function absoluteToKyivLocal(value: string): string | null {
  const date = DateTime.fromISO(value, { setZone: true });
  return date.isValid ? date.setZone(VEHICLE_TRACK_INPUT_TIMEZONE).toFormat("yyyy-MM-dd'T'HH:mm") : null;
}

export function kyivLocalToAbsolute(value: string): Readonly<{ instant: string | null; error: Exclude<VehicleTrackCustomRangeError, "ORDER" | "TOO_LONG"> | null }> {
  if (!value) return Object.freeze({ instant: null, error: "REQUIRED" });
  if (!localDateTimePattern.test(value)) return Object.freeze({ instant: null, error: "INVALID" });
  const date = DateTime.fromFormat(value, "yyyy-MM-dd'T'HH:mm", { zone: VEHICLE_TRACK_INPUT_TIMEZONE, setZone: true, locale: "en" });
  if (!date.isValid) return Object.freeze({ instant: null, error: "INVALID" });
  if (date.toFormat("yyyy-MM-dd'T'HH:mm") !== value) return Object.freeze({ instant: null, error: "NONEXISTENT" });
  if (date.getPossibleOffsets().length > 1) return Object.freeze({ instant: null, error: "AMBIGUOUS" });
  return Object.freeze({ instant: date.toUTC().toISO(), error: null });
}

export function parseVehicleTrackCustomRange(draft: VehicleTrackDraftRange): VehicleTrackCustomRangeResult {
  const from = kyivLocalToAbsolute(draft.from); const to = kyivLocalToAbsolute(draft.to);
  if (from.error) return Object.freeze({ range: null, error: from.error });
  if (to.error) return Object.freeze({ range: null, error: to.error });
  return parseAbsoluteCustomRange(from.instant!, to.instant!);
}

/** Resolves an intentionally empty end boundary at the supplied current instant. */
export function parseVehicleTrackCustomRangeToNow(draft: VehicleTrackDraftRange, now: Date): VehicleTrackCustomRangeResult {
  if (draft.to) return parseVehicleTrackCustomRange(draft);
  const from = kyivLocalToAbsolute(draft.from);
  if (from.error) return Object.freeze({ range: null, error: from.error });
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return Object.freeze({ range: null, error: "INVALID" });
  return parseAbsoluteCustomRange(from.instant!, now.toISOString());
}

function parseAbsoluteCustomRange(from: string, to: string): VehicleTrackCustomRangeResult {
  const range = parseVehicleTrackRange(from, to);
  if (range) return Object.freeze({ range, error: null });
  const fromMs = Date.parse(from); const toMs = Date.parse(to);
  return Object.freeze({ range: null, error: toMs <= fromMs ? "ORDER" : "TOO_LONG" });
}

export function vehicleTrackCustomRangeErrorCopy(error: VehicleTrackCustomRangeError | null, locale: AppLocale = DEFAULT_LOCALE): string | null {
  if (error === "REQUIRED") return translate(locale, "track.rangeError.required");
  if (error === "INVALID") return translate(locale, "track.rangeError.invalid");
  if (error === "NONEXISTENT") return translate(locale, "track.rangeError.nonexistent");
  if (error === "AMBIGUOUS") return translate(locale, "track.rangeError.ambiguous");
  if (error === "ORDER") return translate(locale, "track.rangeError.order");
  if (error === "TOO_LONG") return translate(locale, "track.rangeError.tooLong");
  return null;
}
