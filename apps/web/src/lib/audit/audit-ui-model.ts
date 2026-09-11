import type { AuthPermission } from "../auth/auth-contract";
import type { AuditEventType, AuditReadItem, AuditTargetType } from "./audit-contract";
import { createTranslator, translate } from "../../i18n/core";
import { DEFAULT_LOCALE, DISPLAY_LOCALES, type AppLocale } from "../../i18n/locales";
import { permissionLabel, roleLabel } from "../../i18n/domain-labels";
import { formatDateTime } from "../../i18n/formatting";
import type { MessageKey } from "../../i18n/messages";

export const AUDIT_EVENT_LABELS: Readonly<Record<AuditEventType, string>> = Object.freeze({
  USER_CREATED: translate(DEFAULT_LOCALE, "audit.event.USER_CREATED"), USER_ACCESS_CHANGED: translate(DEFAULT_LOCALE, "audit.event.USER_ACCESS_CHANGED"),
  USER_DISABLED: translate(DEFAULT_LOCALE, "audit.event.USER_DISABLED"), USER_ENABLED: translate(DEFAULT_LOCALE, "audit.event.USER_ENABLED"),
  USER_PASSWORD_RESET: translate(DEFAULT_LOCALE, "audit.event.USER_PASSWORD_RESET"), OWN_PASSWORD_CHANGED: translate(DEFAULT_LOCALE, "audit.event.OWN_PASSWORD_CHANGED"),
  SHORT_POPULATION_EXECUTED: translate(DEFAULT_LOCALE, "audit.event.SHORT_POPULATION_EXECUTED"), DURABLE_POPULATION_CREATED: translate(DEFAULT_LOCALE, "audit.event.DURABLE_POPULATION_CREATED"),
  SYSTEM_POPULATION_CREATED: translate(DEFAULT_LOCALE, "audit.event.SYSTEM_POPULATION_CREATED"), RETENTION_EXECUTED: translate(DEFAULT_LOCALE, "audit.event.RETENTION_EXECUTED"),
  AUTOMATIC_RETENTION_EXECUTED: translate(DEFAULT_LOCALE, "audit.event.AUTOMATIC_RETENTION_EXECUTED"), SETTINGS_UPDATED: translate(DEFAULT_LOCALE, "audit.event.SETTINGS_UPDATED"),
  TELEGRAM_LINKED: translate(DEFAULT_LOCALE, "audit.event.TELEGRAM_LINKED"), TELEGRAM_DISCONNECTED: translate(DEFAULT_LOCALE, "audit.event.TELEGRAM_DISCONNECTED"),
});

export const AUDIT_TARGET_LABELS: Readonly<Record<AuditTargetType, string>> = Object.freeze({
  USER: translate(DEFAULT_LOCALE, "audit.target.USER"), POSITION_HISTORY: translate(DEFAULT_LOCALE, "audit.target.POSITION_HISTORY"),
  POSITION_HISTORY_POPULATION_RUN: translate(DEFAULT_LOCALE, "audit.target.POSITION_HISTORY_POPULATION_RUN"), POSITION_HISTORY_RETENTION: translate(DEFAULT_LOCALE, "audit.target.POSITION_HISTORY_RETENTION"),
  APPLICATION_SETTINGS: translate(DEFAULT_LOCALE, "audit.target.APPLICATION_SETTINGS"),
});

export type AuditDetailGroup = Readonly<{ key: string; title: string; lines: readonly string[] }>;
export type AuditDetailPresentation = Readonly<{ unavailable: boolean; groups: readonly AuditDetailGroup[] }>;

type KnownSettingsField = "timezone" | "minimumDailyDistanceMeters" | "positionFreshnessSeconds" | "speedRuleEnabled" | "citySpeedLimitKph" | "outsideCitySpeedLimitKph" | "speedToleranceKph" | "speedingConfirmationUpdates" | "inactivityRuleEnabled" | "inactivityDistanceMeters" | "inactivityDurationMinutes" | "tripMovementSpeedKph" | "tripMovementConfirmationSeconds" | "tripStopConfirmationSeconds" | "tripDataGapSeconds" | "cityGeofenceGeoJson";
type SettingsDefinition = Readonly<{ labelKey: MessageKey; sectionKey: MessageKey; kind: "timezone" | "boolean" | "number" | "geofence"; min?: number; max?: number }>;

export const AUDIT_SETTINGS_FIELDS: Readonly<Record<KnownSettingsField, SettingsDefinition>> = Object.freeze({
  timezone: { labelKey: "admin.settings.timezone", sectionKey: "admin.settings.section.day", kind: "timezone" },
  minimumDailyDistanceMeters: { labelKey: "admin.settings.minimumDailyDistance", sectionKey: "admin.settings.section.day", kind: "number", min: 0, max: 10_000_000 },
  positionFreshnessSeconds: { labelKey: "admin.settings.positionFreshness", sectionKey: "admin.settings.section.day", kind: "number", min: 1, max: 86_400 },
  speedRuleEnabled: { labelKey: "admin.settings.speedEnabled", sectionKey: "admin.settings.section.speeding", kind: "boolean" },
  citySpeedLimitKph: { labelKey: "admin.settings.citySpeedLimit", sectionKey: "admin.settings.section.speeding", kind: "number", min: 1, max: 200 },
  outsideCitySpeedLimitKph: { labelKey: "admin.settings.outsideCitySpeedLimit", sectionKey: "admin.settings.section.speeding", kind: "number", min: 1, max: 200 },
  speedToleranceKph: { labelKey: "admin.settings.speedTolerance", sectionKey: "admin.settings.section.speeding", kind: "number", min: 0, max: 50 },
  speedingConfirmationUpdates: { labelKey: "admin.settings.speedConfirmations", sectionKey: "admin.settings.section.speeding", kind: "number", min: 1, max: 10 },
  inactivityRuleEnabled: { labelKey: "admin.settings.inactivityEnabled", sectionKey: "admin.settings.section.inactivity", kind: "boolean" },
  inactivityDistanceMeters: { labelKey: "admin.settings.inactivityDistance", sectionKey: "admin.settings.section.inactivity", kind: "number", min: 0, max: 5_000 },
  inactivityDurationMinutes: { labelKey: "admin.settings.inactivityDuration", sectionKey: "admin.settings.section.inactivity", kind: "number", min: 1, max: 1_440 },
  tripMovementSpeedKph: { labelKey: "admin.settings.tripMovementSpeed", sectionKey: "admin.settings.section.trips", kind: "number", min: 1, max: 200 },
  tripMovementConfirmationSeconds: { labelKey: "admin.settings.tripMovementConfirmation", sectionKey: "admin.settings.section.trips", kind: "number", min: 1, max: 604_800 },
  tripStopConfirmationSeconds: { labelKey: "admin.settings.tripStopConfirmation", sectionKey: "admin.settings.section.trips", kind: "number", min: 1, max: 604_800 },
  tripDataGapSeconds: { labelKey: "admin.settings.tripDataGap", sectionKey: "admin.settings.section.trips", kind: "number", min: 1, max: 604_800 },
  cityGeofenceGeoJson: { labelKey: "admin.settings.geofence", sectionKey: "admin.settings.geofence", kind: "geofence" },
});

export function auditEventLabel(value: AuditEventType, locale: AppLocale = DEFAULT_LOCALE): string { return translate(locale, `audit.event.${value}`); }
export function auditTargetTypeLabel(value: AuditTargetType, locale: AppLocale = DEFAULT_LOCALE): string { return translate(locale, `audit.target.${value}`); }
function yes(value: boolean, locale: AppLocale): string { return translate(locale, value ? "common.yes" : "common.no").toLocaleLowerCase(); }
function permissions(value: readonly AuthPermission[], locale: AppLocale): string { return value.length === 0 ? translate(locale, "audit.detail.none") : value.map((permission) => permissionLabel(permission, locale)).join(", "); }
export function formatAuditTimestamp(value: string, locale: AppLocale = DEFAULT_LOCALE): string { return formatDateTime(locale, value) ?? "—"; }
export function auditActorLabel(item: AuditReadItem, locale: AppLocale = DEFAULT_LOCALE): string { return item.actor.type === "SYSTEM" ? translate(locale, "audit.actor.system") : item.actor.login; }
export function auditTargetLabel(item: AuditReadItem, locale: AppLocale = DEFAULT_LOCALE): string { if (item.details.status === "AVAILABLE" && "targetLoginSnapshot" in item.details) return item.details.targetLoginSnapshot; return auditTargetTypeLabel(item.target.type, locale); }

export function auditPermissionChanges(previous: readonly AuthPermission[], next: readonly AuthPermission[]): Readonly<{ added: readonly AuthPermission[]; removed: readonly AuthPermission[] }> {
  const before = new Set(previous); const after = new Set(next);
  return Object.freeze({ added: Object.freeze(next.filter((value) => !before.has(value))), removed: Object.freeze(previous.filter((value) => !after.has(value))) });
}

function settingValue(definition: SettingsDefinition, value: unknown, locale: AppLocale): string | null {
  if (definition.kind === "boolean") return typeof value === "boolean" ? yes(value, locale) : null;
  if (definition.kind === "number") {
    if (typeof value !== "number" || !Number.isInteger(value) || !Number.isFinite(value) || definition.min === undefined || definition.max === undefined || value < definition.min || value > definition.max) return null;
    return new Intl.NumberFormat(DISPLAY_LOCALES[locale]).format(value);
  }
  if (definition.kind === "timezone") {
    if (typeof value !== "string" || value.length === 0 || value.length > 64) return null;
    try { new Intl.DateTimeFormat("en", { timeZone: value }).format(0); return value; } catch { return null; }
  }
  if (value === "not configured") return translate(locale, "admin.settings.geofenceNotConfigured");
  if (typeof value !== "string") return null;
  const match = /^(\d+) rings, (\d+) points$/.exec(value);
  if (!match) return null;
  const rings = Number(match[1]); const points = Number(match[2]);
  if (!Number.isSafeInteger(rings) || !Number.isSafeInteger(points)) return null;
  return translate(locale, "admin.settings.geofenceConfigured", { rings, points });
}

function settingsPresentation(item: Extract<AuditReadItem, { eventType: "SETTINGS_UPDATED" }>, locale: AppLocale): AuditDetailPresentation {
  if (item.details.status === "UNAVAILABLE") return Object.freeze({ unavailable: true, groups: Object.freeze([]) });
  const grouped = new Map<MessageKey, string[]>();
  for (const change of item.details.changes) {
    if (!Object.prototype.hasOwnProperty.call(AUDIT_SETTINGS_FIELDS, change.field)) return Object.freeze({ unavailable: true, groups: Object.freeze([]) });
    const definition = AUDIT_SETTINGS_FIELDS[change.field as KnownSettingsField];
    const previous = settingValue(definition, change.previous, locale); const next = settingValue(definition, change.next, locale);
    if (previous === null || next === null) return Object.freeze({ unavailable: true, groups: Object.freeze([]) });
    const line = translate(locale, "audit.detail.settingChange", { field: translate(locale, definition.labelKey), previous, next });
    grouped.set(definition.sectionKey, [...(grouped.get(definition.sectionKey) ?? []), line]);
  }
  return Object.freeze({ unavailable: false, groups: Object.freeze([...grouped.entries()].map(([key, lines]) => Object.freeze({ key, title: translate(locale, key), lines: Object.freeze(lines) }))) });
}

export function auditDetailPresentation(item: AuditReadItem, locale: AppLocale = DEFAULT_LOCALE): AuditDetailPresentation {
  const t = createTranslator(locale);
  if (item.details.status === "UNAVAILABLE") return Object.freeze({ unavailable: true, groups: Object.freeze([]) });
  const group = (key: string, title: string, lines: readonly string[]): AuditDetailPresentation => Object.freeze({ unavailable: false, groups: Object.freeze([Object.freeze({ key, title, lines: Object.freeze(lines) })]) });
  switch (item.eventType) {
    case "USER_CREATED": return group("account", t("audit.detail.account"), [t("audit.detail.user", { login: item.details.targetLoginSnapshot }), t("audit.detail.role", { role: roleLabel(item.details.role, locale) }), t("audit.detail.permissions", { permissions: permissions(item.details.permissions, locale) })]);
    case "USER_ACCESS_CHANGED": { const changed = auditPermissionChanges(item.details.previousPermissions, item.details.permissions); return group("access", t("audit.detail.access"), [t("audit.detail.user", { login: item.details.targetLoginSnapshot }), t("audit.detail.roleChange", { previous: roleLabel(item.details.previousRole, locale), next: roleLabel(item.details.role, locale) }), t("audit.detail.permissionsAdded", { permissions: permissions(changed.added, locale) }), t("audit.detail.permissionsRemoved", { permissions: permissions(changed.removed, locale) })]); }
    case "USER_DISABLED": return group("operation", t("audit.detail.operation"), [t("audit.detail.userDisabled", { login: item.details.targetLoginSnapshot })]);
    case "USER_ENABLED": return group("operation", t("audit.detail.operation"), [t("audit.detail.userEnabled", { login: item.details.targetLoginSnapshot })]);
    case "USER_PASSWORD_RESET": return group("operation", t("audit.detail.operation"), [t("audit.detail.passwordReset", { login: item.details.targetLoginSnapshot })]);
    case "OWN_PASSWORD_CHANGED": return group("operation", t("audit.detail.operation"), [t("audit.detail.ownPasswordChanged")]);
    case "SHORT_POPULATION_EXECUTED": return group("population", t("audit.detail.population"), [t("audit.detail.to", { value: formatAuditTimestamp(item.details.to, locale) }), t("audit.detail.windowBudget", { count: item.details.windowBudget }), t("audit.detail.committedWindows", { count: item.details.committedWindows }), t("audit.detail.providerDisabledExcluded", { value: yes(item.details.excludeProviderDisabled, locale) })]);
    case "DURABLE_POPULATION_CREATED": case "SYSTEM_POPULATION_CREATED": return group("population", t("audit.detail.populationCreation"), [t("audit.detail.creationOnly"), t("audit.detail.to", { value: formatAuditTimestamp(item.details.to, locale) }), t("audit.detail.windowBudget", { count: item.details.windowBudget }), t("audit.detail.providerDisabledExcluded", { value: yes(item.details.excludeProviderDisabled, locale) })]);
    case "RETENTION_EXECUTED": case "AUTOMATIC_RETENTION_EXECUTED": return group("retention", t("audit.detail.retention"), [t("audit.detail.canonicalAnchor", { value: formatAuditTimestamp(item.details.canonicalAnchor, locale) }), t("audit.detail.cutoff", { value: formatAuditTimestamp(item.details.policyCutoff, locale) }), t("audit.detail.deletedCheckpoints", { count: item.details.deletedCheckpoints }), t("audit.detail.deletedObservations", { count: item.details.deletedObservations }), t("audit.detail.remainingCheckpoints", { count: item.details.remainingFullyObsoleteCheckpoints }), t("audit.detail.remainingObservations", { count: item.details.remainingExecutableObservationCandidates }), t("audit.detail.stoppedByBudget", { value: yes(item.details.stoppedByBudget, locale) })]);
    case "SETTINGS_UPDATED": return settingsPresentation(item, locale);
    case "TELEGRAM_LINKED": return group("operation", t("audit.detail.operation"), [t("audit.detail.telegramLinked")]);
    case "TELEGRAM_DISCONNECTED": return group("operation", t("audit.detail.operation"), [t("audit.detail.telegramDisconnected")]);
  }
}

export function auditOutcome(item: AuditReadItem, locale: AppLocale = DEFAULT_LOCALE): string {
  const t = createTranslator(locale);
  if (item.details.status === "UNAVAILABLE" || auditDetailPresentation(item, locale).unavailable) return t("audit.unavailableDetails");
  switch (item.eventType) {
    case "USER_CREATED": return t("audit.outcome.userCreated", { login: item.details.targetLoginSnapshot });
    case "USER_ACCESS_CHANGED": return t("audit.outcome.accessChanged", { login: item.details.targetLoginSnapshot });
    case "USER_DISABLED": return t("audit.detail.userDisabled", { login: item.details.targetLoginSnapshot });
    case "USER_ENABLED": return t("audit.detail.userEnabled", { login: item.details.targetLoginSnapshot });
    case "USER_PASSWORD_RESET": return t("audit.detail.passwordReset", { login: item.details.targetLoginSnapshot });
    case "OWN_PASSWORD_CHANGED": return t("audit.detail.ownPasswordChanged");
    case "SHORT_POPULATION_EXECUTED": return t("audit.outcome.populationCommitted", { count: item.details.committedWindows });
    case "DURABLE_POPULATION_CREATED": case "SYSTEM_POPULATION_CREATED": return t("audit.outcome.populationCreated", { count: item.details.windowBudget });
    case "RETENTION_EXECUTED": case "AUTOMATIC_RETENTION_EXECUTED": return t("audit.outcome.retention", { checkpoints: item.details.deletedCheckpoints, observations: item.details.deletedObservations });
    case "SETTINGS_UPDATED": return t("audit.outcome.settings", { count: item.details.changes.length });
    case "TELEGRAM_LINKED": return t("audit.detail.telegramLinked");
    case "TELEGRAM_DISCONNECTED": return t("audit.detail.telegramDisconnected");
  }
}

export function auditDetailsLines(item: AuditReadItem, locale: AppLocale = DEFAULT_LOCALE): readonly string[] { const detail = auditDetailPresentation(item, locale); return detail.unavailable ? Object.freeze([translate(locale, "audit.unavailableDetails")]) : Object.freeze(detail.groups.flatMap((group) => group.lines)); }
