import { PERMISSION_LABELS } from "../admin-users/admin-users-contract";
import type { AuditEventType, AuditReadItem, AuditTargetType } from "./audit-contract";

export const AUDIT_EVENT_LABELS: Readonly<Record<AuditEventType, string>> = Object.freeze({
  USER_CREATED: "Пользователь создан",
  USER_ACCESS_CHANGED: "Доступ пользователя изменён",
  USER_DISABLED: "Пользователь отключён",
  USER_ENABLED: "Пользователь включён",
  USER_PASSWORD_RESET: "Пароль пользователя сброшен",
  OWN_PASSWORD_CHANGED: "Пользователь изменил свой пароль",
  SHORT_POPULATION_EXECUTED: "Выполнено ручное дозаполнение GPS-истории",
  DURABLE_POPULATION_CREATED: "Создано фоновое дозаполнение истории",
  SYSTEM_POPULATION_CREATED: "Автоматически создано дозаполнение истории",
  RETENTION_EXECUTED: "Выполнена ручная очистка GPS-истории",
  AUTOMATIC_RETENTION_EXECUTED: "Выполнена автоматическая очистка GPS-истории",
});

export const AUDIT_TARGET_LABELS: Readonly<Record<AuditTargetType, string>> = Object.freeze({
  USER: "Пользователь",
  POSITION_HISTORY: "GPS-история",
  POSITION_HISTORY_POPULATION_RUN: "Запуск дозаполнения истории",
  POSITION_HISTORY_RETENTION: "Очистка GPS-истории",
});

function yes(value: boolean): string { return value ? "да" : "нет"; }
function permissions(value: readonly (keyof typeof PERMISSION_LABELS)[]): string { return value.length === 0 ? "нет" : value.map((permission) => PERMISSION_LABELS[permission]).join(", "); }
export function formatAuditTimestamp(value: string): string { return new Date(value).toLocaleString("ru-RU"); }
export function auditActorLabel(item: AuditReadItem): string { return item.actor.type === "SYSTEM" ? "Система" : item.actor.login; }
export function auditTargetLabel(item: AuditReadItem): string { return item.target.id === null ? AUDIT_TARGET_LABELS[item.target.type] : `${AUDIT_TARGET_LABELS[item.target.type]} · ${item.target.id}`; }

export function auditDetailsLines(item: AuditReadItem): readonly string[] {
  if (item.details.status === "UNAVAILABLE") return Object.freeze(["Детали события недоступны"]);
  switch (item.eventType) {
    case "USER_CREATED":
      return Object.freeze([`Пользователь: ${item.details.targetLoginSnapshot}`, `Роль: ${item.details.role}`, `Права: ${permissions(item.details.permissions)}`]);
    case "USER_ACCESS_CHANGED":
      return Object.freeze([`Пользователь: ${item.details.targetLoginSnapshot}`, `Роль: ${item.details.previousRole} → ${item.details.role}`, `Права до: ${permissions(item.details.previousPermissions)}`, `Права после: ${permissions(item.details.permissions)}`]);
    case "USER_DISABLED":
      return Object.freeze([`Отключён пользователь ${item.details.targetLoginSnapshot}`]);
    case "USER_ENABLED":
      return Object.freeze([`Включён пользователь ${item.details.targetLoginSnapshot}`]);
    case "USER_PASSWORD_RESET":
      return Object.freeze([`Сброшен пароль пользователя ${item.details.targetLoginSnapshot}`]);
    case "OWN_PASSWORD_CHANGED":
      return Object.freeze(["Пользователь изменил собственный пароль"]);
    case "SHORT_POPULATION_EXECUTED":
      return Object.freeze([`До: ${formatAuditTimestamp(item.details.to)}`, `Лимит окон: ${item.details.windowBudget}`, `Зафиксировано окон: ${item.details.committedWindows}`, `Отключённые у провайдера исключены: ${yes(item.details.excludeProviderDisabled)}`]);
    case "DURABLE_POPULATION_CREATED":
    case "SYSTEM_POPULATION_CREATED":
      return Object.freeze([`До: ${formatAuditTimestamp(item.details.to)}`, `Лимит окон: ${item.details.windowBudget}`, `Отключённые у провайдера исключены: ${yes(item.details.excludeProviderDisabled)}`]);
    case "RETENTION_EXECUTED":
    case "AUTOMATIC_RETENTION_EXECUTED":
      return Object.freeze([`Контрольная точка: ${formatAuditTimestamp(item.details.canonicalAnchor)}`, `Cutoff: ${formatAuditTimestamp(item.details.policyCutoff)}`, `Удалено checkpoint'ов: ${item.details.deletedCheckpoints}`, `Удалено GPS-наблюдений: ${item.details.deletedObservations}`, `Осталось полностью устаревших checkpoint'ов: ${item.details.remainingFullyObsoleteCheckpoints}`, `Осталось кандидатов GPS-наблюдений: ${item.details.remainingExecutableObservationCandidates}`, `Остановлено лимитом: ${yes(item.details.stoppedByBudget)}`]);
  }
}
