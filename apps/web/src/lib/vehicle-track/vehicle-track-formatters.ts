import { translate } from "../../i18n/core";
import { formatDateTime, formatNumber } from "../../i18n/formatting";
import { DEFAULT_LOCALE, DISPLAY_LOCALES, DISPLAY_TIMEZONE, type AppLocale } from "../../i18n/locales";
export function formatVehicleTrackTimestamp(value: string | null, locale: AppLocale = DEFAULT_LOCALE): string { return formatDateTime(locale, value, { dateStyle: "medium", timeStyle: "medium" }) ?? "—"; }
export function formatVehicleTrackClock(value: string | null, locale: AppLocale = DEFAULT_LOCALE): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(DISPLAY_LOCALES[locale], { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: DISPLAY_TIMEZONE }).format(date) : "—";
}
export function formatVehicleTrackSpeed(value: number | null, locale: AppLocale = DEFAULT_LOCALE): string { return value === null ? translate(locale, "common.noData") : `${formatNumber(locale, value, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${translate(locale, "unit.kilometresPerHour")}`; }
export function formatVehicleTrackQualityWarnings(value: number, locale: AppLocale = DEFAULT_LOCALE): string {
  const category = new Intl.PluralRules(DISPLAY_LOCALES[locale]).select(value);
  const forms = {
    ru: { one: "предупреждение", few: "предупреждения", many: "предупреждений", other: "предупреждения" },
    uk: { one: "попередження", few: "попередження", many: "попереджень", other: "попередження" },
    en: { one: "warning", other: "warnings" },
  }[locale] as Readonly<Record<string, string>>;
  return `${formatNumber(locale, value)} ${forms[category] ?? forms.other}`;
}
export function vehicleTrackQualityLabels(valid: boolean | null, outdated: boolean | null, locale: AppLocale = DEFAULT_LOCALE): readonly string[] {
  const labels: string[] = [];
  if (valid === false) labels.push(translate(locale, "track.quality.invalid"));
  if (outdated === true) labels.push(translate(locale, "track.quality.outdated"));
  if (labels.length === 0 && valid === null && outdated === null) labels.push(translate(locale, "track.quality.unspecified"));
  if (labels.length === 0) labels.push(translate(locale, "track.quality.noWarnings"));
  return labels;
}
