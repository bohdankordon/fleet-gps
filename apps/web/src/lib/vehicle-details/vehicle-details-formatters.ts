import type { VehicleDetailsEvent } from "./vehicle-details-contract";
import { alertStatusLabel, alertTypeLabel, alertZoneLabel, formatAlertDistance, formatAlertSpeed, formatAlertTimestamp, notificationDeliveryLabel } from "../alert-events/alert-events-formatters";

export function formatVehicleDistance(value: number): string { return `${(value / 1_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} км`; }
export function formatVehicleDuration(value: number | null): string { if (value === null) return "—"; const minutes = Math.floor(value / 60); return minutes < 60 ? `${minutes} мин` : `${Math.floor(minutes / 60)} ч ${minutes % 60} мин`; }
export function formatVehicleSpeed(value: number | null): string { return value === null ? "—" : formatAlertSpeed(value); }
export function formatVehicleTimestamp(value: string): string { return formatAlertTimestamp(value); }
export function formatVehicleAge(observedAt: string, generatedAt: string): string { const observed = Date.parse(observedAt); const generated = Date.parse(generatedAt); if (!Number.isFinite(observed) || !Number.isFinite(generated) || observed > generated) return "время позиции уточняется"; const seconds = Math.floor((generated - observed) / 1_000); if (seconds < 10) return "только что"; if (seconds < 60) return `${seconds} сек назад`; const minutes = Math.floor(seconds / 60); return minutes < 60 ? `${minutes} мин назад` : `${Math.floor(minutes / 60)} ч назад`; }
export function freshnessLabel(value: "FRESH" | "STALE"): string { return value === "FRESH" ? "Свежая" : "Устаревшая"; }
export function qualityLabel(value: "EXACT" | "PROVISIONAL" | "ESTIMATED"): string { return ({ EXACT: "Точные данные", PROVISIONAL: "Предварительные данные", ESTIMATED: "Оценочные данные" })[value]; }
export function sourceLabel(value: "RUNS" | "MODE1" | "HISTORICAL_POSITIONS"): string { return ({ RUNS: "Данные пробегов", MODE1: "Телематические данные", HISTORICAL_POSITIONS: "История позиций" })[value]; }
export function vehicleEventDetailsLabel(event: VehicleDetailsEvent): string { return event.type === "SPEEDING" ? `${alertZoneLabel(event.details.zone)} · подтверждение ${formatAlertSpeed(event.details.confirmationSpeedKph)} · порог ${formatAlertSpeed(event.details.thresholdKph)} · пик ${formatAlertSpeed(event.details.peakSpeedKph)}` : `окно ${event.details.durationThresholdMinutes} мин · порог ${formatAlertDistance(event.details.distanceThresholdMeters)} · минимум ${formatAlertDistance(event.details.minimumDistanceMeters)}`; }
export { alertStatusLabel, alertTypeLabel, notificationDeliveryLabel };
