import { translate } from "../../i18n/core";
import { formatDateTime, formatNumber } from "../../i18n/formatting";
import { DEFAULT_LOCALE, type AppLocale } from "../../i18n/locales";

export const schedulerNoDataLabel = translate(DEFAULT_LOCALE, "common.noData");

export function formatSchedulerTimestamp(value: string | null, timezone: string | null | undefined, locale: AppLocale = DEFAULT_LOCALE): string {
  if (!value || !timezone) return translate(locale, "common.noData");
  return formatDateTime(locale, value, { dateStyle: "short", timeStyle: "medium" }) ?? translate(locale, "common.noData");
}

export function formatSchedulerInterval(seconds: number, locale: AppLocale = DEFAULT_LOCALE): string {
  if (!Number.isInteger(seconds) || seconds < 0) return translate(locale, "common.noData");
  if (seconds === 60) return `${formatNumber(locale, 1)} ${translate(locale, "unit.minuteShort")}`;
  if (seconds === 300) return `${formatNumber(locale, 5)} ${translate(locale, "unit.minuteShort")}`;
  const minutes = Math.floor(seconds / 60); const remainder = seconds % 60;
  if (minutes > 0 && remainder > 0) return `${formatNumber(locale, minutes)} ${translate(locale, "unit.minuteShort")} ${formatNumber(locale, remainder)} ${translate(locale, "unit.secondShort")}`;
  if (minutes > 0) return `${formatNumber(locale, minutes)} ${translate(locale, "unit.minuteShort")}`;
  return `${formatNumber(locale, seconds)} ${translate(locale, "unit.secondShort")}`;
}

export function schedulerFailureCategoryLabel(value: "equgps" | "database" | "configuration" | "unknown" | null, locale: AppLocale = DEFAULT_LOCALE): string {
  return value === null ? translate(locale, "common.noData") : translate(locale, `scheduler.failure.${value}`);
}
