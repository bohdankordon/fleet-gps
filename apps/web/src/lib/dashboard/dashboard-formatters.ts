import type { DashboardVehiclesResponse } from "./dashboard-contract";

export function formatDistance(value: number | null): string { return value === null ? "Нет данных" : `${(value / 1_000).toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 1 })} км`; }
export function formatSpeed(value: number | null): string { return value === null ? "Нет данных" : `${value.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} км/ч`; }
export function formatTimestamp(value: string | null, timezone: string): string { if (value === null) return "Нет данных"; try { return new Intl.DateTimeFormat("ru-RU", { timeZone: timezone, dateStyle: "short", timeStyle: "short" }).format(new Date(value)); } catch { return "Нет данных"; } }
export function formatGeneratedAt(value: string | null, timezone: string): string { return formatTimestamp(value, timezone); }
export function statusLabel(value: DashboardVehiclesResponse["vehicles"][number]["status"]): string { return ({ online: "Онлайн", offline: "Офлайн", unknown: "Неизвестно" })[value]; }
export function sourceLabel(value: DashboardVehiclesResponse["vehicles"][number]["dailyDistanceSource"]): string { return value === null ? "Нет данных" : ({ runs: "Быстрые данные", mode1: "Детальный отчёт", historical_positions: "Исторические позиции" })[value]; }
export function qualityLabel(value: DashboardVehiclesResponse["vehicles"][number]["dailyDistanceQuality"]): string { return value === null ? "Нет данных" : ({ exact: "Точно", provisional: "Предварительно", estimated: "Оценка" })[value]; }
export function freshnessLabel(value: DashboardVehiclesResponse["vehicles"][number]["positionFreshness"]): string { return ({ fresh: "Свежая", stale: "Устарела", missing: "Нет позиции", future: "Время впереди" })[value]; }
