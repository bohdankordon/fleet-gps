import type { OpenAlertMapAlert } from "./open-alert-map-contract";

export type ActiveAlertDetail = Readonly<{ type: OpenAlertMapAlert["type"]; label: string; openedAt: string }>;

export function openAlertTypeLabel(type: OpenAlertMapAlert["type"]): string {
  return type === "SPEEDING" ? "Превышение скорости" : "Неактивность";
}

export function activeAlertDetails(alerts: readonly OpenAlertMapAlert[]): readonly ActiveAlertDetail[] {
  return alerts.map((alert) => ({ type: alert.type, label: openAlertTypeLabel(alert.type), openedAt: alert.openedAt }));
}
