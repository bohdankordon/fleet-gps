import type { OpenAlertMapAlert } from "./open-alert-map-contract";
import { alertTypeLabel } from "../alert-events/alert-events-formatters";
import { DEFAULT_LOCALE, type AppLocale } from "../../i18n/locales";

export type ActiveAlertDetail = Readonly<{ type: OpenAlertMapAlert["type"]; label: string; openedAt: string }>;

export function openAlertTypeLabel(type: OpenAlertMapAlert["type"], locale: AppLocale = DEFAULT_LOCALE): string {
  return alertTypeLabel(type, locale);
}

export function activeAlertDetails(alerts: readonly OpenAlertMapAlert[], locale: AppLocale = DEFAULT_LOCALE): readonly ActiveAlertDetail[] {
  return alerts.map((alert) => ({ type: alert.type, label: openAlertTypeLabel(alert.type, locale), openedAt: alert.openedAt }));
}
