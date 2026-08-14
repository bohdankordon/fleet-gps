import type { VehicleDetailsEvent } from "./vehicle-details-contract";
import { alertStatusLabel, alertTypeLabel, alertZoneLabel, formatAlertDistance, formatAlertSpeed, formatAlertTimestamp, notificationDeliveryLabel } from "../alert-events/alert-events-formatters";
import { translate } from "../../i18n/core";
import { formatNumber } from "../../i18n/formatting";
import { DEFAULT_LOCALE, type AppLocale } from "../../i18n/locales";
import { formatFleetMapAge } from "../fleet-map/fleet-map-formatters";

export function formatVehicleDistance(value: number, locale: AppLocale = DEFAULT_LOCALE): string { return `${formatNumber(locale, value / 1_000, { maximumFractionDigits: 1 })} ${translate(locale, "unit.kilometre")}`; }
export function formatVehicleDuration(value: number | null, locale: AppLocale = DEFAULT_LOCALE): string { if (value === null) return "—"; const minutes = Math.floor(value / 60); return minutes < 60 ? `${formatNumber(locale, minutes)} ${translate(locale, "unit.minuteShort")}` : `${formatNumber(locale, Math.floor(minutes / 60))} ${translate(locale, "unit.hourShort")} ${formatNumber(locale, minutes % 60)} ${translate(locale, "unit.minuteShort")}`; }
export function formatVehicleSpeed(value: number | null, locale: AppLocale = DEFAULT_LOCALE): string { return value === null ? "—" : formatAlertSpeed(value, locale); }
export function formatVehicleTimestamp(value: string, locale: AppLocale = DEFAULT_LOCALE): string { return formatAlertTimestamp(value, locale); }
export function formatVehicleAge(observedAt: string, generatedAt: string, locale: AppLocale = DEFAULT_LOCALE): string { return formatFleetMapAge(observedAt, generatedAt, locale); }
export function freshnessLabel(value: "FRESH" | "STALE", locale: AppLocale = DEFAULT_LOCALE): string { return translate(locale, `vehicle.freshness.${value}`); }
export function qualityLabel(value: "EXACT" | "PROVISIONAL" | "ESTIMATED", locale: AppLocale = DEFAULT_LOCALE): string { return translate(locale, `vehicle.quality.${value}`); }
export function sourceLabel(value: "RUNS" | "MODE1" | "HISTORICAL_POSITIONS", locale: AppLocale = DEFAULT_LOCALE): string { return translate(locale, `vehicle.source.${value}`); }
export function vehicleEventDetailsLabel(event: VehicleDetailsEvent, locale: AppLocale = DEFAULT_LOCALE): string { return event.type === "SPEEDING" ? translate(locale, "events.details.speeding", { zone: alertZoneLabel(event.details.zone, locale), confirmation: formatAlertSpeed(event.details.confirmationSpeedKph, locale), threshold: formatAlertSpeed(event.details.thresholdKph, locale), peak: formatAlertSpeed(event.details.peakSpeedKph, locale) }) : translate(locale, "events.details.inactivityVehicle", { minutes: formatNumber(locale, event.details.durationThresholdMinutes), threshold: formatAlertDistance(event.details.distanceThresholdMeters, locale), minimum: formatAlertDistance(event.details.minimumDistanceMeters, locale) }); }
export { alertStatusLabel, alertTypeLabel, notificationDeliveryLabel };
