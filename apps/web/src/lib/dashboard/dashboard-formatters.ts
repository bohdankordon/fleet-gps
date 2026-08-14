import type { DashboardVehiclesResponse } from "./dashboard-contract";
import { translate } from "../../i18n/core";
import { formatDateTime, formatNumber } from "../../i18n/formatting";
import { DEFAULT_LOCALE, DISPLAY_TIMEZONE, type AppLocale } from "../../i18n/locales";

export function formatDistance(value: number | null, locale: AppLocale = DEFAULT_LOCALE): string { return value === null ? translate(locale, "common.noData") : `${formatNumber(locale, value / 1_000, { minimumFractionDigits: 0, maximumFractionDigits: 1 })} ${translate(locale, "unit.kilometre")}`; }
export function formatSpeed(value: number | null, locale: AppLocale = DEFAULT_LOCALE): string { return value === null ? translate(locale, "common.noData") : `${formatNumber(locale, value, { maximumFractionDigits: 1 })} ${translate(locale, "unit.kilometresPerHour")}`; }
export function formatTimestamp(value: string | null, timezone: string, locale: AppLocale = DEFAULT_LOCALE): string { return timezone === DISPLAY_TIMEZONE ? (formatDateTime(locale, value) ?? translate(locale, "common.noData")) : translate(locale, "common.noData"); }
export function formatGeneratedAt(value: string | null, timezone: string, locale: AppLocale = DEFAULT_LOCALE): string { return formatTimestamp(value, timezone, locale); }
export function statusLabel(value: DashboardVehiclesResponse["vehicles"][number]["status"], locale: AppLocale = DEFAULT_LOCALE): string { return translate(locale, `dashboard.status.${value}`); }
export function sourceLabel(value: DashboardVehiclesResponse["vehicles"][number]["dailyDistanceSource"], locale: AppLocale = DEFAULT_LOCALE): string { return value === null ? translate(locale, "common.noData") : translate(locale, `dashboard.format.source.${value}`); }
export function qualityLabel(value: DashboardVehiclesResponse["vehicles"][number]["dailyDistanceQuality"], locale: AppLocale = DEFAULT_LOCALE): string { return value === null ? translate(locale, "common.noData") : translate(locale, `dashboard.format.quality.${value}`); }
export function freshnessLabel(value: DashboardVehiclesResponse["vehicles"][number]["positionFreshness"], locale: AppLocale = DEFAULT_LOCALE): string { return translate(locale, `dashboard.format.freshness.${value}`); }
