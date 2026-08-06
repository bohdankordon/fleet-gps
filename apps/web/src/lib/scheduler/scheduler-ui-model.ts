import type { SchedulerStatusResponse } from "./scheduler-contract";
import { parseSchedulerStatusResponse } from "./scheduler-contract";

export function schedulerStateLabel(status: SchedulerStatusResponse): string { return status.enabled ? "Включено" : "Отключено"; }
export function schedulerInitialErrorLabel(status: SchedulerStatusResponse | null): string | null { return status ? null : "Не удалось загрузить состояние обновления."; }
export function schedulerRefreshUpdatesHistory(): boolean { return false; }
export function parseSchedulerRefreshPayload(value: unknown): SchedulerStatusResponse | null { try { return parseSchedulerStatusResponse(value); } catch { return null; } }
