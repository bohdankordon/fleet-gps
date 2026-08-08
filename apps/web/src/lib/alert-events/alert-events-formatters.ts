import type { AlertEvent } from "./alert-events-contract";

export function formatAlertTimestamp(value: string | null): string { if (value === null) return "Нет данных"; try { return new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Kyiv", dateStyle: "short", timeStyle: "short" }).format(new Date(value)); } catch { return "Нет данных"; } }
export function formatAlertSpeed(value: number): string { return `${value.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} км/ч`; }
export function formatAlertDistance(value: number): string { return `${value.toLocaleString("ru-RU", { maximumFractionDigits: 0 })} м`; }
export function alertTypeLabel(value: AlertEvent["type"]): string { return value === "SPEEDING" ? "Превышение скорости" : "Неактивность"; }
export function alertStatusLabel(value: AlertEvent["status"]): string { return value === "OPEN" ? "Открыто" : "Завершено"; }
export function alertZoneLabel(value: "CITY" | "OUTSIDE_CITY"): string { return value === "CITY" ? "Город" : "За городом"; }
export function notificationDeliveryLabel(value: AlertEvent["notificationDeliveryStatus"]): string { return ({ NONE: "Не отправлялось", PENDING: "Ожидает отправки", SENT: "Отправлено", FAILED: "Ошибка доставки" })[value]; }
export function alertDetailsLabel(event: AlertEvent): string { return event.type === "SPEEDING" ? `${alertZoneLabel(event.details.zone)} · подтверждение ${formatAlertSpeed(event.details.confirmationSpeedKph)} · порог ${formatAlertSpeed(event.details.thresholdKph)} · пик ${formatAlertSpeed(event.details.peakSpeedKph)}` : `окно ${event.details.durationThresholdMinutes} мин · порог ${formatAlertDistance(event.details.distanceThresholdMeters)} · подтверждение ${formatAlertDistance(event.details.confirmationDistanceMeters)} · минимум ${formatAlertDistance(event.details.minimumDistanceMeters)}`; }
