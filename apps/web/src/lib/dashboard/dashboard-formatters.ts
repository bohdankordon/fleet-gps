import type { DashboardVehiclesResponse } from "./dashboard-contract";
import { translate } from "../../i18n/core";
import { formatDateTime, formatNumber } from "../../i18n/formatting";
import { DEFAULT_LOCALE, DISPLAY_TIMEZONE, type AppLocale } from "../../i18n/locales";

export function formatDistance(value: number | null, locale: AppLocale = DEFAULT_LOCALE): string { return value === null ? translate(locale, "common.noData") : `${formatNumber(locale, value / 1_000, { minimumFractionDigits: 0, maximumFractionDigits: 1 })} ${translate(locale, "unit.kilometre")}`; }
export function formatSpeed(value: number | null, locale: AppLocale = DEFAULT_LOCALE): string { return value === null ? translate(locale, "common.noData") : `${formatNumber(locale, value, { maximumFractionDigits: 1 })} ${translate(locale, "unit.kilometresPerHour")}`; }
/** The dashboard API requires this server-owned setting; callers must not invent a browser fallback. */
export function dashboardTimezone(data: Pick<DashboardVehiclesResponse, "timezone">): string { return data.timezone; }
export function formatTimestamp(value: string | null, timezone: string, locale: AppLocale = DEFAULT_LOCALE): string { return timezone === DISPLAY_TIMEZONE ? (formatDateTime(locale, value) ?? translate(locale, "common.noData")) : translate(locale, "common.noData"); }
export function formatGeneratedAt(value: string | null, timezone: string, locale: AppLocale = DEFAULT_LOCALE): string { return formatTimestamp(value, timezone, locale); }
/** Fleet metadata intentionally uses a locale-independent operational date format in the authoritative application timezone. */
export function formatFleetMetadataTimestamp(value: string | null, timezone: string, locale: AppLocale = DEFAULT_LOCALE): string {
  if (timezone !== DISPLAY_TIMEZONE || value === null) return translate(locale, "common.noData");
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return translate(locale, "common.noData");
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
    const valueFor = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
    const [year, month, day, hour, minute] = [valueFor("year"), valueFor("month"), valueFor("day"), valueFor("hour"), valueFor("minute")];
    return year && month && day && hour && minute ? `${year}-${month}-${day}, ${hour}:${minute}` : translate(locale, "common.noData");
  } catch { return translate(locale, "common.noData"); }
}
export function formatFleetServiceDate(value: string, locale: AppLocale = DEFAULT_LOCALE): string { return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : translate(locale, "common.noData"); }
export function statusLabel(value: DashboardVehiclesResponse["vehicles"][number]["status"], locale: AppLocale = DEFAULT_LOCALE): string { return translate(locale, `dashboard.status.${value}`); }
export function sourceLabel(value: DashboardVehiclesResponse["vehicles"][number]["dailyDistanceSource"], locale: AppLocale = DEFAULT_LOCALE): string { return value === null ? translate(locale, "common.noData") : translate(locale, `dashboard.format.source.${value}`); }
export function qualityLabel(value: DashboardVehiclesResponse["vehicles"][number]["dailyDistanceQuality"], locale: AppLocale = DEFAULT_LOCALE): string { return value === null ? translate(locale, "common.noData") : translate(locale, `dashboard.format.quality.${value}`); }
export function freshnessLabel(value: DashboardVehiclesResponse["vehicles"][number]["positionFreshness"], locale: AppLocale = DEFAULT_LOCALE): string { return translate(locale, `dashboard.format.freshness.${value}`); }
