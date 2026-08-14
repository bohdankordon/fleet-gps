import type { SchedulerStatusResponse } from "./scheduler-contract";
import { parseSchedulerStatusResponse } from "./scheduler-contract";
import { translate } from "../../i18n/core";
import { DEFAULT_LOCALE, type AppLocale } from "../../i18n/locales";

export function schedulerStateLabel(status: SchedulerStatusResponse, locale: AppLocale = DEFAULT_LOCALE): string { return translate(locale, status.enabled ? "scheduler.enabled" : "scheduler.stateDisabled"); }
export function schedulerInitialErrorLabel(status: SchedulerStatusResponse | null, locale: AppLocale = DEFAULT_LOCALE): string | null { return status ? null : translate(locale, "scheduler.loadError"); }
export function schedulerRefreshUpdatesHistory(): boolean { return false; }
export function parseSchedulerRefreshPayload(value: unknown): SchedulerStatusResponse | null { try { return parseSchedulerStatusResponse(value); } catch { return null; } }
