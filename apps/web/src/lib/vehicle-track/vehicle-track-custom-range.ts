import { DateTime } from "luxon";
import { parseVehicleTrackRange, type VehicleTrackRange } from "./vehicle-track-range";

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
  const range = parseVehicleTrackRange(from.instant, to.instant);
  if (range) return Object.freeze({ range, error: null });
  const fromMs = Date.parse(from.instant!); const toMs = Date.parse(to.instant!);
  return Object.freeze({ range: null, error: toMs <= fromMs ? "ORDER" : "TOO_LONG" });
}

export function vehicleTrackCustomRangeErrorCopy(error: VehicleTrackCustomRangeError | null): string | null {
  if (error === "REQUIRED") return "Заполните обе границы периода.";
  if (error === "INVALID") return "Укажите существующие дату и время.";
  if (error === "NONEXISTENT") return "Такого местного времени нет из-за перехода на летнее время.";
  if (error === "AMBIGUOUS") return "Это местное время встречается дважды из-за перевода часов. Выберите другое время.";
  if (error === "ORDER") return "Время «С» должно быть раньше времени «До».";
  if (error === "TOO_LONG") return "Максимальный период — 7 дней.";
  return null;
}
