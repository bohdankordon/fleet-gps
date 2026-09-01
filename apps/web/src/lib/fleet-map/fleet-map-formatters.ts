import { translate } from "../../i18n/core";
import { formatNumber } from "../../i18n/formatting";
import { DEFAULT_LOCALE, DISPLAY_TIMEZONE, type AppLocale } from "../../i18n/locales";
import { formatFleetMetadataTimestamp } from "../dashboard/dashboard-formatters";

export function formatFleetMapAge(observedAt: string, generatedAt: string, locale: AppLocale = DEFAULT_LOCALE): string {
  const observed = Date.parse(observedAt); const generated = Date.parse(generatedAt);
  if (!Number.isFinite(observed) || !Number.isFinite(generated) || observed > generated) return translate(locale, "format.age.unknown");
  const seconds = Math.floor((generated - observed) / 1_000);
  if (seconds < 10) return translate(locale, "format.age.justNow");
  if (seconds < 60) return translate(locale, "format.age.secondsAgo", { count: formatNumber(locale, seconds) });
  const minutes = Math.floor(seconds / 60); if (minutes < 60) return translate(locale, "format.age.minutesAgo", { count: formatNumber(locale, minutes) });
  return translate(locale, "format.age.hoursAgo", { count: formatNumber(locale, Math.floor(minutes / 60)) });
}

export function formatFleetMapTimestamp(value: string, locale: AppLocale = DEFAULT_LOCALE): string {
  return formatFleetMetadataTimestamp(value, DISPLAY_TIMEZONE, locale);
}
