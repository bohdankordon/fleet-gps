import { translate } from "../../i18n/core";
import { formatDateTime, formatNumber } from "../../i18n/formatting";
import { DEFAULT_LOCALE, type AppLocale } from "../../i18n/locales";
export function formatVehicleTrackTimestamp(value: string | null, locale: AppLocale = DEFAULT_LOCALE): string { return formatDateTime(locale, value, { dateStyle: "medium", timeStyle: "medium" }) ?? "—"; }
export function formatVehicleTrackSpeed(value: number | null, locale: AppLocale = DEFAULT_LOCALE): string { return value === null ? translate(locale, "common.noData") : `${formatNumber(locale, value, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${translate(locale, "unit.kilometresPerHour")}`; }
export function vehicleTrackQualityLabels(valid: boolean | null, outdated: boolean | null, locale: AppLocale = DEFAULT_LOCALE): readonly string[] {
  const labels: string[] = [];
  if (valid === false) labels.push(translate(locale, "track.quality.invalid"));
  if (outdated === true) labels.push(translate(locale, "track.quality.outdated"));
  if (labels.length === 0 && valid === null && outdated === null) labels.push(translate(locale, "track.quality.unspecified"));
  if (labels.length === 0) labels.push(translate(locale, "track.quality.noWarnings"));
  return labels;
}
