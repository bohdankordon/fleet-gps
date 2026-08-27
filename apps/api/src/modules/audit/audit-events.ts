import { normalizeUuid } from "../../common/uuid.validation";
import { AuditActorType, AuditEventType, AuditTargetType, AuthRole } from "../../generated/prisma/enums";
import { LOGIN_PATTERN } from "../auth/login";
import { isPermission, PERMISSIONS, resolvePermissions, type Permission } from "../auth/permissions";
import { POSITION_HISTORY_BROWSER_WINDOW_BUDGETS, type PositionHistoryBrowserWindowBudget } from "../position-history-horizon-execution/position-history-horizon-execution.types";
import { parseAbsoluteTimestamp } from "../vehicle-track/vehicle-track-query-params";
import type {
  AuditActor,
  AuditEventDetails,
  AuditEventSpec,
  AuditSystemActor,
  AuditUserActor,
  DurablePopulationCreatedAuditDetails,
  RetentionExecutedAuditDetails,
  ShortPopulationExecutedAuditDetails,
  SettingsUpdatedAuditDetails,
  UserAccessChangedAuditDetails,
  UserCreatedAuditDetails,
} from "./audit.types";

export class AuditEventValidationError extends Error {
  public constructor(public readonly reason: string) {
    super(`Invalid audit event: ${reason}`);
    this.name = "AuditEventValidationError";
  }
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new AuditEventValidationError(`${label} must be a JSON object`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const keys = Object.keys(value);
  if (keys.some((key) => !allowed.includes(key)) || keys.length !== allowed.length) {
    throw new AuditEventValidationError(`${label} must contain exactly ${allowed.join(", ")}`);
  }
}

function requiredUuid(value: unknown, label: string): string {
  const normalized = normalizeUuid(value);
  if (normalized === null) throw new AuditEventValidationError(`${label} must be a UUID`);
  return normalized;
}

function requiredString(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) throw new AuditEventValidationError(`${label} must be a non-empty string of at most ${maxLength} characters`);
  return value;
}

function requiredSafeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new AuditEventValidationError(`${label} must be a non-negative safe integer`);
  return value;
}

function requiredPositiveSafeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) throw new AuditEventValidationError(`${label} must be a positive safe integer`);
  return value;
}

function requiredBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new AuditEventValidationError(`${label} must be a boolean`);
  return value;
}

function requiredTimestamp(value: unknown, label: string): string {
  const text = requiredString(value, label, 64);
  if (parseAbsoluteTimestamp(text) === null) throw new AuditEventValidationError(`${label} must be an absolute ISO-8601 timestamp`);
  return text;
}

function requiredLoginSnapshot(value: unknown, label: string): string {
  if (typeof value !== "string" || !LOGIN_PATTERN.test(value)) throw new AuditEventValidationError(`${label} must match the configured login format`);
  return value;
}

function requiredRole(value: unknown, label: string): AuthRole {
  if (value !== AuthRole.ADMIN && value !== AuthRole.USER) throw new AuditEventValidationError(`${label} must be ADMIN or USER`);
  return value;
}

function requiredCanonicalPermissions(value: unknown, label: string): readonly Permission[] {
  if (!Array.isArray(value) || value.some((key) => typeof key !== "string" || !isPermission(key))) {
    throw new AuditEventValidationError(`${label} must contain only approved permissions`);
  }
  if (new Set(value).size !== value.length) throw new AuditEventValidationError(`${label} cannot contain duplicates`);
  const canonical = resolvePermissions(value as readonly string[]);
  if (canonical.length !== value.length || canonical.some((key, index) => key !== value[index])) {
    throw new AuditEventValidationError(`${label} must use canonical permission order and dependencies`);
  }
  return Object.freeze([...canonical]);
}

function requiredEffectivePermissions(role: AuthRole, value: unknown, label: string): readonly Permission[] {
  const permissions = requiredCanonicalPermissions(value, label);
  if (role === AuthRole.ADMIN && (permissions.length !== PERMISSIONS.length || permissions.some((key, index) => key !== PERMISSIONS[index]))) {
    throw new AuditEventValidationError(`${label} must describe ADMIN full access`);
  }
  return permissions;
}

function durableDetails(details: DurablePopulationCreatedAuditDetails): DurablePopulationCreatedAuditDetails {
  return Object.freeze({
    to: requiredTimestamp(details.to, "to"),
    windowBudget: requiredPositiveSafeInteger(details.windowBudget, "windowBudget"),
    excludeProviderDisabled: requiredBoolean(details.excludeProviderDisabled, "excludeProviderDisabled"),
  });
}

function retentionDetails(details: RetentionExecutedAuditDetails): RetentionExecutedAuditDetails {
  return Object.freeze({
    canonicalAnchor: requiredTimestamp(details.canonicalAnchor, "canonicalAnchor"),
    policyCutoff: requiredTimestamp(details.policyCutoff, "policyCutoff"),
    deletedCheckpoints: requiredSafeInteger(details.deletedCheckpoints, "deletedCheckpoints"),
    deletedObservations: requiredSafeInteger(details.deletedObservations, "deletedObservations"),
    remainingFullyObsoleteCheckpoints: requiredSafeInteger(details.remainingFullyObsoleteCheckpoints, "remainingFullyObsoleteCheckpoints"),
    remainingExecutableObservationCandidates: requiredSafeInteger(details.remainingExecutableObservationCandidates, "remainingExecutableObservationCandidates"),
    stoppedByBudget: requiredBoolean(details.stoppedByBudget, "stoppedByBudget"),
  });
}

function shortPopulationDetails(details: ShortPopulationExecutedAuditDetails): ShortPopulationExecutedAuditDetails {
  const windowBudget = requiredPositiveSafeInteger(details.windowBudget, "windowBudget");
  if (!POSITION_HISTORY_BROWSER_WINDOW_BUDGETS.includes(windowBudget as PositionHistoryBrowserWindowBudget)) throw new AuditEventValidationError("windowBudget must be an approved browser population budget");
  const committedWindows = requiredSafeInteger(details.committedWindows, "committedWindows");
  if (committedWindows > windowBudget) throw new AuditEventValidationError("committedWindows cannot exceed windowBudget");
  return Object.freeze({
    to: requiredTimestamp(details.to, "to"),
    windowBudget,
    excludeProviderDisabled: requiredBoolean(details.excludeProviderDisabled, "excludeProviderDisabled"),
    committedWindows,
  });
}

export function buildUserActor(userId: string, loginSnapshot: string): AuditUserActor {
  return Object.freeze({
    actorType: AuditActorType.USER,
    actorUserId: requiredUuid(userId, "actorUserId"),
    actorLoginSnapshot: requiredLoginSnapshot(loginSnapshot, "actorLoginSnapshot"),
  });
}

export function buildSystemActor(): AuditSystemActor {
  return Object.freeze({ actorType: AuditActorType.SYSTEM, actorUserId: null, actorLoginSnapshot: null });
}

function settingsDetails(details: SettingsUpdatedAuditDetails): SettingsUpdatedAuditDetails {
  if (!Array.isArray(details.changes) || details.changes.length === 0 || details.changes.length > 16) throw new AuditEventValidationError("settings changes must be a non-empty bounded array");
  const changes = details.changes.map((change) => {
    const item = object(change, "settings change");
    exactKeys(item, ["field", "previous", "next"], "settings change");
    const primitive = (value: unknown, label: string): string | number | boolean | null => {
      if (value === null || typeof value === "string" || typeof value === "boolean") return value;
      if (typeof value === "number" && Number.isFinite(value)) return value;
      throw new AuditEventValidationError(`${label} must be a JSON primitive`);
    };
    return Object.freeze({ field: requiredString(item.field, "settings field", 64), previous: primitive(item.previous, "previous"), next: primitive(item.next, "next") });
  });
  if (new Set(changes.map((change) => change.field)).size !== changes.length) throw new AuditEventValidationError("settings fields cannot repeat");
  return Object.freeze({ changes: Object.freeze(changes) });
}

export function buildSettingsUpdatedAuditEvent(actor: AuditUserActor, details: SettingsUpdatedAuditDetails): AuditEventSpec {
  return Object.freeze({ eventType: AuditEventType.SETTINGS_UPDATED, actor: buildUserActor(actor.actorUserId, actor.actorLoginSnapshot), targetType: AuditTargetType.APPLICATION_SETTINGS, targetId: "1", details: settingsDetails(details) });
}

export function assertAuditActor(actorType: unknown, actorUserId: unknown, actorLoginSnapshot: unknown): AuditActor {
  if (actorType === AuditActorType.SYSTEM) {
    if (actorUserId !== null || actorLoginSnapshot !== null) throw new AuditEventValidationError("SYSTEM actors cannot have user identity or a login snapshot");
    return buildSystemActor();
  }
  if (actorType === AuditActorType.USER) return buildUserActor(requiredUuid(actorUserId, "actorUserId"), requiredString(actorLoginSnapshot, "actorLoginSnapshot", 64));
  throw new AuditEventValidationError("actorType must be USER or SYSTEM");
}

export function buildUserCreatedAuditEvent(actor: AuditUserActor, targetId: string, details: UserCreatedAuditDetails): AuditEventSpec {
  const role = requiredRole(details.role, "role");
  return Object.freeze({
    eventType: AuditEventType.USER_CREATED,
    actor: buildUserActor(actor.actorUserId, actor.actorLoginSnapshot),
    targetType: AuditTargetType.USER,
    targetId: requiredUuid(targetId, "targetId"),
    details: Object.freeze({
      targetLoginSnapshot: requiredLoginSnapshot(details.targetLoginSnapshot, "targetLoginSnapshot"),
      role,
      permissions: requiredEffectivePermissions(role, details.permissions, "permissions"),
    }),
  });
}

export function buildUserAccessChangedAuditEvent(actor: AuditUserActor, targetId: string, details: UserAccessChangedAuditDetails): AuditEventSpec {
  const previousRole = requiredRole(details.previousRole, "previousRole");
  const role = requiredRole(details.role, "role");
  return Object.freeze({
    eventType: AuditEventType.USER_ACCESS_CHANGED,
    actor: buildUserActor(actor.actorUserId, actor.actorLoginSnapshot),
    targetType: AuditTargetType.USER,
    targetId: requiredUuid(targetId, "targetId"),
    details: Object.freeze({
      targetLoginSnapshot: requiredLoginSnapshot(details.targetLoginSnapshot, "targetLoginSnapshot"),
      previousRole,
      role,
      previousPermissions: requiredEffectivePermissions(previousRole, details.previousPermissions, "previousPermissions"),
      permissions: requiredEffectivePermissions(role, details.permissions, "permissions"),
    }),
  });
}

function buildUserTargetSnapshotEvent(eventType: typeof AuditEventType.USER_DISABLED | typeof AuditEventType.USER_ENABLED | typeof AuditEventType.USER_PASSWORD_RESET, actor: AuditUserActor, targetId: string, targetLoginSnapshot: string): AuditEventSpec {
  return Object.freeze({
    eventType,
    actor: buildUserActor(actor.actorUserId, actor.actorLoginSnapshot),
    targetType: AuditTargetType.USER,
    targetId: requiredUuid(targetId, "targetId"),
    details: Object.freeze({ targetLoginSnapshot: requiredLoginSnapshot(targetLoginSnapshot, "targetLoginSnapshot") }),
  });
}

export function buildUserDisabledAuditEvent(actor: AuditUserActor, targetId: string, targetLoginSnapshot: string): AuditEventSpec {
  return buildUserTargetSnapshotEvent(AuditEventType.USER_DISABLED, actor, targetId, targetLoginSnapshot);
}

export function buildUserEnabledAuditEvent(actor: AuditUserActor, targetId: string, targetLoginSnapshot: string): AuditEventSpec {
  return buildUserTargetSnapshotEvent(AuditEventType.USER_ENABLED, actor, targetId, targetLoginSnapshot);
}

export function buildUserPasswordResetAuditEvent(actor: AuditUserActor, targetId: string, targetLoginSnapshot: string): AuditEventSpec {
  return buildUserTargetSnapshotEvent(AuditEventType.USER_PASSWORD_RESET, actor, targetId, targetLoginSnapshot);
}

export function buildOwnPasswordChangedAuditEvent(actor: AuditUserActor): AuditEventSpec {
  const validatedActor = buildUserActor(actor.actorUserId, actor.actorLoginSnapshot);
  return Object.freeze({ eventType: AuditEventType.OWN_PASSWORD_CHANGED, actor: validatedActor, targetType: AuditTargetType.USER, targetId: validatedActor.actorUserId, details: Object.freeze({}) });
}

export function buildShortPopulationExecutedAuditEvent(actor: AuditUserActor, details: ShortPopulationExecutedAuditDetails): AuditEventSpec {
  return Object.freeze({
    eventType: AuditEventType.SHORT_POPULATION_EXECUTED,
    actor: buildUserActor(actor.actorUserId, actor.actorLoginSnapshot),
    targetType: AuditTargetType.POSITION_HISTORY,
    targetId: null,
    details: shortPopulationDetails(details),
  });
}

export function buildDurablePopulationCreatedAuditEvent(actor: AuditUserActor, targetId: string, details: DurablePopulationCreatedAuditDetails): AuditEventSpec {
  return Object.freeze({ eventType: AuditEventType.DURABLE_POPULATION_CREATED, actor: buildUserActor(actor.actorUserId, actor.actorLoginSnapshot), targetType: AuditTargetType.POSITION_HISTORY_POPULATION_RUN, targetId: requiredUuid(targetId, "targetId"), details: durableDetails(details) });
}

export function buildSystemPopulationCreatedAuditEvent(targetId: string, details: DurablePopulationCreatedAuditDetails): AuditEventSpec {
  return Object.freeze({ eventType: AuditEventType.SYSTEM_POPULATION_CREATED, actor: buildSystemActor(), targetType: AuditTargetType.POSITION_HISTORY_POPULATION_RUN, targetId: requiredUuid(targetId, "targetId"), details: durableDetails(details) });
}

export function buildRetentionExecutedAuditEvent(actor: AuditUserActor, details: RetentionExecutedAuditDetails): AuditEventSpec {
  return Object.freeze({ eventType: AuditEventType.RETENTION_EXECUTED, actor: buildUserActor(actor.actorUserId, actor.actorLoginSnapshot), targetType: AuditTargetType.POSITION_HISTORY_RETENTION, targetId: null, details: retentionDetails(details) });
}

export function buildAutomaticRetentionExecutedAuditEvent(details: RetentionExecutedAuditDetails): AuditEventSpec {
  return Object.freeze({ eventType: AuditEventType.AUTOMATIC_RETENTION_EXECUTED, actor: buildSystemActor(), targetType: AuditTargetType.POSITION_HISTORY_RETENTION, targetId: null, details: retentionDetails(details) });
}

function parseUserActor(value: unknown): AuditUserActor {
  const actor = object(value, "actor");
  exactKeys(actor, ["actorType", "actorUserId", "actorLoginSnapshot"], "actor");
  if (actor.actorType !== AuditActorType.USER) throw new AuditEventValidationError("this audit event requires a USER actor");
  return buildUserActor(actor.actorUserId as string, actor.actorLoginSnapshot as string);
}

function parseSystemActor(value: unknown): AuditSystemActor {
  const actor = object(value, "actor");
  exactKeys(actor, ["actorType", "actorUserId", "actorLoginSnapshot"], "actor");
  const parsed = assertAuditActor(actor.actorType, actor.actorUserId, actor.actorLoginSnapshot);
  if (parsed.actorType !== AuditActorType.SYSTEM) throw new AuditEventValidationError("expected SYSTEM actor");
  return parsed;
}

function userTarget(event: Record<string, unknown>, eventType: string): Readonly<{ actor: AuditUserActor; targetId: string }> {
  if (event.targetType !== AuditTargetType.USER) throw new AuditEventValidationError(`${eventType} must target USER`);
  return Object.freeze({ actor: parseUserActor(event.actor), targetId: requiredUuid(event.targetId, "targetId") });
}

function parseSnapshotDetails(value: unknown, eventType: string): string {
  const details = object(value, "details");
  exactKeys(details, ["targetLoginSnapshot"], `${eventType} details`);
  return details.targetLoginSnapshot as string;
}

function parseDurableDetails(value: unknown, eventType: string): DurablePopulationCreatedAuditDetails {
  const details = object(value, "details");
  exactKeys(details, ["to", "windowBudget", "excludeProviderDisabled"], `${eventType} details`);
  return details as DurablePopulationCreatedAuditDetails;
}

function parseRetentionDetails(value: unknown, eventType: string): RetentionExecutedAuditDetails {
  const details = object(value, "details");
  exactKeys(details, ["canonicalAnchor", "policyCutoff", "deletedCheckpoints", "deletedObservations", "remainingFullyObsoleteCheckpoints", "remainingExecutableObservationCandidates", "stoppedByBudget"], `${eventType} details`);
  return details as RetentionExecutedAuditDetails;
}

export function parseAuditEventDetails(eventType: unknown, value: unknown): AuditEventDetails {
  const details = object(value, "details");
  switch (eventType) {
    case AuditEventType.USER_CREATED: {
      exactKeys(details, ["targetLoginSnapshot", "role", "permissions"], "USER_CREATED details");
      const role = requiredRole(details.role, "role");
      return Object.freeze({
        targetLoginSnapshot: requiredLoginSnapshot(details.targetLoginSnapshot, "targetLoginSnapshot"),
        role,
        permissions: requiredEffectivePermissions(role, details.permissions, "permissions"),
      });
    }
    case AuditEventType.USER_ACCESS_CHANGED: {
      exactKeys(details, ["targetLoginSnapshot", "previousRole", "role", "previousPermissions", "permissions"], "USER_ACCESS_CHANGED details");
      const previousRole = requiredRole(details.previousRole, "previousRole");
      const role = requiredRole(details.role, "role");
      return Object.freeze({
        targetLoginSnapshot: requiredLoginSnapshot(details.targetLoginSnapshot, "targetLoginSnapshot"),
        previousRole,
        role,
        previousPermissions: requiredEffectivePermissions(previousRole, details.previousPermissions, "previousPermissions"),
        permissions: requiredEffectivePermissions(role, details.permissions, "permissions"),
      });
    }
    case AuditEventType.USER_DISABLED:
    case AuditEventType.USER_ENABLED:
    case AuditEventType.USER_PASSWORD_RESET:
      exactKeys(details, ["targetLoginSnapshot"], `${eventType} details`);
      return Object.freeze({ targetLoginSnapshot: requiredLoginSnapshot(details.targetLoginSnapshot, "targetLoginSnapshot") });
    case AuditEventType.OWN_PASSWORD_CHANGED:
      exactKeys(details, [], "OWN_PASSWORD_CHANGED details");
      return Object.freeze({});
    case AuditEventType.SHORT_POPULATION_EXECUTED:
      exactKeys(details, ["to", "windowBudget", "excludeProviderDisabled", "committedWindows"], "SHORT_POPULATION_EXECUTED details");
      return shortPopulationDetails(details as ShortPopulationExecutedAuditDetails);
    case AuditEventType.DURABLE_POPULATION_CREATED:
    case AuditEventType.SYSTEM_POPULATION_CREATED:
      exactKeys(details, ["to", "windowBudget", "excludeProviderDisabled"], `${eventType} details`);
      return durableDetails(details as DurablePopulationCreatedAuditDetails);
    case AuditEventType.RETENTION_EXECUTED:
    case AuditEventType.AUTOMATIC_RETENTION_EXECUTED:
      exactKeys(details, ["canonicalAnchor", "policyCutoff", "deletedCheckpoints", "deletedObservations", "remainingFullyObsoleteCheckpoints", "remainingExecutableObservationCandidates", "stoppedByBudget"], `${eventType} details`);
      return retentionDetails(details as RetentionExecutedAuditDetails);
    case AuditEventType.SETTINGS_UPDATED:
      exactKeys(details, ["changes"], "SETTINGS_UPDATED details");
      return settingsDetails(details as SettingsUpdatedAuditDetails);
    default:
      throw new AuditEventValidationError("eventType is not implemented");
  }
}

export function parseAuditEventSpec(value: unknown): AuditEventSpec {
  const event = object(value, "audit event");
  exactKeys(event, ["eventType", "actor", "targetType", "targetId", "details"], "audit event");

  switch (event.eventType) {
    case AuditEventType.USER_CREATED: {
      const target = userTarget(event, AuditEventType.USER_CREATED);
      const details = object(event.details, "details");
      exactKeys(details, ["targetLoginSnapshot", "role", "permissions"], "USER_CREATED details");
      return buildUserCreatedAuditEvent(target.actor, target.targetId, details as UserCreatedAuditDetails);
    }
    case AuditEventType.USER_ACCESS_CHANGED: {
      const target = userTarget(event, AuditEventType.USER_ACCESS_CHANGED);
      const details = object(event.details, "details");
      exactKeys(details, ["targetLoginSnapshot", "previousRole", "role", "previousPermissions", "permissions"], "USER_ACCESS_CHANGED details");
      return buildUserAccessChangedAuditEvent(target.actor, target.targetId, details as UserAccessChangedAuditDetails);
    }
    case AuditEventType.USER_DISABLED: {
      const target = userTarget(event, AuditEventType.USER_DISABLED);
      return buildUserDisabledAuditEvent(target.actor, target.targetId, parseSnapshotDetails(event.details, AuditEventType.USER_DISABLED));
    }
    case AuditEventType.USER_ENABLED: {
      const target = userTarget(event, AuditEventType.USER_ENABLED);
      return buildUserEnabledAuditEvent(target.actor, target.targetId, parseSnapshotDetails(event.details, AuditEventType.USER_ENABLED));
    }
    case AuditEventType.USER_PASSWORD_RESET: {
      const target = userTarget(event, AuditEventType.USER_PASSWORD_RESET);
      return buildUserPasswordResetAuditEvent(target.actor, target.targetId, parseSnapshotDetails(event.details, AuditEventType.USER_PASSWORD_RESET));
    }
    case AuditEventType.OWN_PASSWORD_CHANGED: {
      const target = userTarget(event, AuditEventType.OWN_PASSWORD_CHANGED);
      const details = object(event.details, "details");
      exactKeys(details, [], "OWN_PASSWORD_CHANGED details");
      if (target.targetId !== target.actor.actorUserId) throw new AuditEventValidationError("OWN_PASSWORD_CHANGED actor and target must match");
      return buildOwnPasswordChangedAuditEvent(target.actor);
    }
    case AuditEventType.SHORT_POPULATION_EXECUTED: {
      if (event.targetType !== AuditTargetType.POSITION_HISTORY || event.targetId !== null) throw new AuditEventValidationError("SHORT_POPULATION_EXECUTED must target POSITION_HISTORY with a null targetId");
      const details = object(event.details, "details");
      exactKeys(details, ["to", "windowBudget", "excludeProviderDisabled", "committedWindows"], "SHORT_POPULATION_EXECUTED details");
      return buildShortPopulationExecutedAuditEvent(parseUserActor(event.actor), details as ShortPopulationExecutedAuditDetails);
    }
    case AuditEventType.DURABLE_POPULATION_CREATED:
      if (event.targetType !== AuditTargetType.POSITION_HISTORY_POPULATION_RUN) throw new AuditEventValidationError("DURABLE_POPULATION_CREATED must target POSITION_HISTORY_POPULATION_RUN");
      return buildDurablePopulationCreatedAuditEvent(parseUserActor(event.actor), event.targetId as string, parseDurableDetails(event.details, AuditEventType.DURABLE_POPULATION_CREATED));
    case AuditEventType.SYSTEM_POPULATION_CREATED:
      if (event.targetType !== AuditTargetType.POSITION_HISTORY_POPULATION_RUN) throw new AuditEventValidationError("SYSTEM_POPULATION_CREATED must target POSITION_HISTORY_POPULATION_RUN");
      parseSystemActor(event.actor);
      return buildSystemPopulationCreatedAuditEvent(event.targetId as string, parseDurableDetails(event.details, AuditEventType.SYSTEM_POPULATION_CREATED));
    case AuditEventType.RETENTION_EXECUTED:
      if (event.targetType !== AuditTargetType.POSITION_HISTORY_RETENTION || event.targetId !== null) throw new AuditEventValidationError("RETENTION_EXECUTED must target POSITION_HISTORY_RETENTION with a null targetId");
      return buildRetentionExecutedAuditEvent(parseUserActor(event.actor), parseRetentionDetails(event.details, AuditEventType.RETENTION_EXECUTED));
    case AuditEventType.AUTOMATIC_RETENTION_EXECUTED:
      if (event.targetType !== AuditTargetType.POSITION_HISTORY_RETENTION || event.targetId !== null) throw new AuditEventValidationError("AUTOMATIC_RETENTION_EXECUTED must target POSITION_HISTORY_RETENTION with a null targetId");
      parseSystemActor(event.actor);
      return buildAutomaticRetentionExecutedAuditEvent(parseRetentionDetails(event.details, AuditEventType.AUTOMATIC_RETENTION_EXECUTED));
    case AuditEventType.SETTINGS_UPDATED:
      if (event.targetType !== AuditTargetType.APPLICATION_SETTINGS || event.targetId !== "1") throw new AuditEventValidationError("SETTINGS_UPDATED must target the ApplicationSettings singleton");
      return buildSettingsUpdatedAuditEvent(parseUserActor(event.actor), settingsDetails(event.details as SettingsUpdatedAuditDetails));
    default:
      throw new AuditEventValidationError("eventType is not implemented");
  }
}

export { assertAuditActor as validateAuditActor };
