import type { AlertEvent } from "./alert-events-contract";
import { translate } from "../../i18n/core";
import { formatDateTime, formatNumber } from "../../i18n/formatting";
import { DEFAULT_LOCALE, type AppLocale } from "../../i18n/locales";

export function formatAlertTimestamp(value: string | null, locale: AppLocale = DEFAULT_LOCALE): string { return formatDateTime(locale, value) ?? translate(locale, "common.noData"); }
export function formatAlertSpeed(value: number, locale: AppLocale = DEFAULT_LOCALE): string { return `${formatNumber(locale, value, { maximumFractionDigits: 1 })} ${translate(locale, "unit.kilometresPerHour")}`; }
export function formatAlertDistance(value: number, locale: AppLocale = DEFAULT_LOCALE): string { return `${formatNumber(locale, value, { maximumFractionDigits: 0 })} ${translate(locale, "unit.metre")}`; }
export function alertTypeLabel(value: AlertEvent["type"], locale: AppLocale = DEFAULT_LOCALE): string { return translate(locale, `events.type.${value}`); }
export function alertStatusLabel(value: AlertEvent["status"], locale: AppLocale = DEFAULT_LOCALE): string { return translate(locale, `events.status.${value}`); }
export function alertZoneLabel(value: "CITY" | "OUTSIDE_CITY", locale: AppLocale = DEFAULT_LOCALE): string { return translate(locale, `events.zone.${value}`); }
export function notificationDeliveryLabel(value: AlertEvent["notificationDeliveryStatus"], locale: AppLocale = DEFAULT_LOCALE): string { return translate(locale, `events.delivery.${value}`); }
export function alertDetailsLabel(event: AlertEvent, locale: AppLocale = DEFAULT_LOCALE): string { return event.type === "SPEEDING" ? translate(locale, "events.details.speeding", { zone: alertZoneLabel(event.details.zone, locale), confirmation: formatAlertSpeed(event.details.confirmationSpeedKph, locale), threshold: formatAlertSpeed(event.details.thresholdKph, locale), peak: formatAlertSpeed(event.details.peakSpeedKph, locale) }) : translate(locale, "events.details.inactivity", { minutes: formatNumber(locale, event.details.durationThresholdMinutes), threshold: formatAlertDistance(event.details.distanceThresholdMeters, locale), confirmation: formatAlertDistance(event.details.confirmationDistanceMeters, locale), minimum: formatAlertDistance(event.details.minimumDistanceMeters, locale) }); }
