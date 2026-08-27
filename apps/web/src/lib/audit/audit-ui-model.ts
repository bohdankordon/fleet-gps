import type { AuthPermission } from "../auth/auth-contract";
import type { AuditEventType, AuditReadItem, AuditTargetType } from "./audit-contract";
import { createTranslator, translate } from "../../i18n/core";
import { DEFAULT_LOCALE, type AppLocale } from "../../i18n/locales";
import { permissionLabel, roleLabel } from "../../i18n/domain-labels";
import { formatDateTime } from "../../i18n/formatting";

export const AUDIT_EVENT_LABELS: Readonly<Record<AuditEventType, string>> = Object.freeze({
  USER_CREATED: translate(DEFAULT_LOCALE, "audit.event.USER_CREATED"),
  USER_ACCESS_CHANGED: translate(DEFAULT_LOCALE, "audit.event.USER_ACCESS_CHANGED"),
  USER_DISABLED: translate(DEFAULT_LOCALE, "audit.event.USER_DISABLED"),
  USER_ENABLED: translate(DEFAULT_LOCALE, "audit.event.USER_ENABLED"),
  USER_PASSWORD_RESET: translate(DEFAULT_LOCALE, "audit.event.USER_PASSWORD_RESET"),
  OWN_PASSWORD_CHANGED: translate(DEFAULT_LOCALE, "audit.event.OWN_PASSWORD_CHANGED"),
  SHORT_POPULATION_EXECUTED: translate(DEFAULT_LOCALE, "audit.event.SHORT_POPULATION_EXECUTED"),
  DURABLE_POPULATION_CREATED: translate(DEFAULT_LOCALE, "audit.event.DURABLE_POPULATION_CREATED"),
  SYSTEM_POPULATION_CREATED: translate(DEFAULT_LOCALE, "audit.event.SYSTEM_POPULATION_CREATED"),
  RETENTION_EXECUTED: translate(DEFAULT_LOCALE, "audit.event.RETENTION_EXECUTED"),
  AUTOMATIC_RETENTION_EXECUTED: translate(DEFAULT_LOCALE, "audit.event.AUTOMATIC_RETENTION_EXECUTED"),
  SETTINGS_UPDATED: translate(DEFAULT_LOCALE, "audit.event.SETTINGS_UPDATED"),
});

export const AUDIT_TARGET_LABELS: Readonly<Record<AuditTargetType, string>> = Object.freeze({
  USER: translate(DEFAULT_LOCALE, "audit.target.USER"),
  POSITION_HISTORY: translate(DEFAULT_LOCALE, "audit.target.POSITION_HISTORY"),
  POSITION_HISTORY_POPULATION_RUN: translate(DEFAULT_LOCALE, "audit.target.POSITION_HISTORY_POPULATION_RUN"),
  POSITION_HISTORY_RETENTION: translate(DEFAULT_LOCALE, "audit.target.POSITION_HISTORY_RETENTION"),
  APPLICATION_SETTINGS: translate(DEFAULT_LOCALE, "audit.target.APPLICATION_SETTINGS"),
});

export function auditEventLabel(value: AuditEventType, locale: AppLocale = DEFAULT_LOCALE): string { return translate(locale, `audit.event.${value}`); }
export function auditTargetTypeLabel(value: AuditTargetType, locale: AppLocale = DEFAULT_LOCALE): string { return translate(locale, `audit.target.${value}`); }
function yes(value: boolean, locale: AppLocale): string { return translate(locale, value ? "common.yes" : "common.no").toLocaleLowerCase(); }
function permissions(value: readonly AuthPermission[], locale: AppLocale): string { return value.length === 0 ? translate(locale, "common.no").toLocaleLowerCase() : value.map((permission) => permissionLabel(permission, locale)).join(", "); }
export function formatAuditTimestamp(value: string, locale: AppLocale = DEFAULT_LOCALE): string { return formatDateTime(locale, value) ?? "—"; }
export function auditActorLabel(item: AuditReadItem, locale: AppLocale = DEFAULT_LOCALE): string { return item.actor.type === "SYSTEM" ? translate(locale, "audit.actor.system") : item.actor.login; }
export function auditTargetLabel(item: AuditReadItem, locale: AppLocale = DEFAULT_LOCALE): string { const label = auditTargetTypeLabel(item.target.type, locale); return item.target.id === null ? label : `${label} · ${item.target.id}`; }

export function auditDetailsLines(item: AuditReadItem, locale: AppLocale = DEFAULT_LOCALE): readonly string[] {
  const t = createTranslator(locale);
  if (item.details.status === "UNAVAILABLE") return Object.freeze([t("audit.unavailableDetails")]);
  switch (item.eventType) {
    case "USER_CREATED":
      return Object.freeze([t("audit.detail.user", { login: item.details.targetLoginSnapshot }), t("audit.detail.role", { role: roleLabel(item.details.role, locale) }), t("audit.detail.permissions", { permissions: permissions(item.details.permissions, locale) })]);
    case "USER_ACCESS_CHANGED":
      return Object.freeze([t("audit.detail.user", { login: item.details.targetLoginSnapshot }), t("audit.detail.roleChange", { previous: roleLabel(item.details.previousRole, locale), next: roleLabel(item.details.role, locale) }), t("audit.detail.permissionsBefore", { permissions: permissions(item.details.previousPermissions, locale) }), t("audit.detail.permissionsAfter", { permissions: permissions(item.details.permissions, locale) })]);
    case "USER_DISABLED":
      return Object.freeze([t("audit.detail.userDisabled", { login: item.details.targetLoginSnapshot })]);
    case "USER_ENABLED":
      return Object.freeze([t("audit.detail.userEnabled", { login: item.details.targetLoginSnapshot })]);
    case "USER_PASSWORD_RESET":
      return Object.freeze([t("audit.detail.passwordReset", { login: item.details.targetLoginSnapshot })]);
    case "OWN_PASSWORD_CHANGED":
      return Object.freeze([t("audit.detail.ownPasswordChanged")]);
    case "SHORT_POPULATION_EXECUTED":
      return Object.freeze([t("audit.detail.to", { value: formatAuditTimestamp(item.details.to, locale) }), t("audit.detail.windowBudget", { count: item.details.windowBudget }), t("audit.detail.committedWindows", { count: item.details.committedWindows }), t("audit.detail.providerDisabledExcluded", { value: yes(item.details.excludeProviderDisabled, locale) })]);
    case "DURABLE_POPULATION_CREATED":
    case "SYSTEM_POPULATION_CREATED":
      return Object.freeze([t("audit.detail.to", { value: formatAuditTimestamp(item.details.to, locale) }), t("audit.detail.windowBudget", { count: item.details.windowBudget }), t("audit.detail.providerDisabledExcluded", { value: yes(item.details.excludeProviderDisabled, locale) })]);
    case "RETENTION_EXECUTED":
    case "AUTOMATIC_RETENTION_EXECUTED":
      return Object.freeze([t("audit.detail.canonicalAnchor", { value: formatAuditTimestamp(item.details.canonicalAnchor, locale) }), t("audit.detail.cutoff", { value: formatAuditTimestamp(item.details.policyCutoff, locale) }), t("audit.detail.deletedCheckpoints", { count: item.details.deletedCheckpoints }), t("audit.detail.deletedObservations", { count: item.details.deletedObservations }), t("audit.detail.remainingCheckpoints", { count: item.details.remainingFullyObsoleteCheckpoints }), t("audit.detail.remainingObservations", { count: item.details.remainingExecutableObservationCandidates }), t("audit.detail.stoppedByBudget", { value: yes(item.details.stoppedByBudget, locale) })]);
    case "SETTINGS_UPDATED":
      return Object.freeze(item.details.changes.map((change) => `${change.field}: ${String(change.previous)} → ${String(change.next)}`));
  }
}
