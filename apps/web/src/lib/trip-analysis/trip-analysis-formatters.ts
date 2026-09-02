import { translate } from "../../i18n/core";
import { formatDateTime, formatNumber } from "../../i18n/formatting";
import { DEFAULT_LOCALE, DISPLAY_LOCALES, DISPLAY_TIMEZONE, type AppLocale } from "../../i18n/locales";
export function formatTripAnalysisTime(value: string, locale: AppLocale = DEFAULT_LOCALE): string { return formatDateTime(locale, value) ?? "—"; }
export function formatTripAnalysisClock(value: string, locale: AppLocale = DEFAULT_LOCALE): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat(DISPLAY_LOCALES[locale], { hour: "2-digit", minute: "2-digit", timeZone: DISPLAY_TIMEZONE }).format(date);
  } catch {
    return "—";
  }
}
export function formatTripAnalysisDuration(seconds: number, locale: AppLocale = DEFAULT_LOCALE): string { if (seconds < 60) return `${formatNumber(locale, Math.round(seconds))} ${translate(locale, "unit.secondShort")}`; const minutes = Math.round(seconds / 60); if (minutes < 60) return `${formatNumber(locale, minutes)} ${translate(locale, "unit.minuteShort")}`; const hours = Math.floor(minutes / 60); const rest = minutes % 60; return rest === 0 ? `${formatNumber(locale, hours)} ${translate(locale, "unit.hourShort")}` : `${formatNumber(locale, hours)} ${translate(locale, "unit.hourShort")} ${formatNumber(locale, rest)} ${translate(locale, "unit.minuteShort")}`; }
export function formatObservedDistance(meters: number, locale: AppLocale = DEFAULT_LOCALE): string { return meters < 1_000 ? `${formatNumber(locale, Math.round(meters))} ${translate(locale, "unit.metre")}` : `${formatNumber(locale, meters / 1_000, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${translate(locale, "unit.kilometre")}`; }
