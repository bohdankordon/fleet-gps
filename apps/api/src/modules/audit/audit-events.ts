import { normalizeUuid } from "../../common/uuid.validation";
import { AuditActorType, AuditEventType, AuditTargetType } from "../../generated/prisma/enums";
import { LOGIN_PATTERN } from "../auth/login";
import { parseAbsoluteTimestamp } from "../vehicle-track/vehicle-track-query-params";
import type { AuditActor, AuditEventSpec, AuditSystemActor, AuditUserActor } from "./audit.types";

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

export function buildUserActor(userId: string, loginSnapshot: string): AuditUserActor {
  return Object.freeze({
    actorType: AuditActorType.USER,
    actorUserId: requiredUuid(userId, "actorUserId"),
    actorLoginSnapshot: requiredLoginSnapshot(loginSnapshot, "actorLoginSnapshot"),
  });
}

export function assertAuditActor(actorType: unknown, actorUserId: unknown, actorLoginSnapshot: unknown): AuditActor {
  if (actorType === AuditActorType.SYSTEM) {
    if (actorUserId !== null || actorLoginSnapshot !== null) throw new AuditEventValidationError("SYSTEM actors cannot have user identity or a login snapshot");
    return Object.freeze({ actorType: AuditActorType.SYSTEM, actorUserId: null, actorLoginSnapshot: null });
  }
  if (actorType === AuditActorType.USER) {
    return buildUserActor(requiredUuid(actorUserId, "actorUserId"), requiredString(actorLoginSnapshot, "actorLoginSnapshot", 64));
  }
  throw new AuditEventValidationError("actorType must be USER or SYSTEM");
}

export function buildUserDisabledAuditEvent(actor: AuditUserActor, targetId: string, targetLoginSnapshot: string): AuditEventSpec {
  return Object.freeze({
    eventType: AuditEventType.USER_DISABLED,
    actor: buildUserActor(actor.actorUserId, actor.actorLoginSnapshot),
    targetType: AuditTargetType.USER,
    targetId: requiredUuid(targetId, "targetId"),
    details: Object.freeze({ targetLoginSnapshot: requiredLoginSnapshot(targetLoginSnapshot, "targetLoginSnapshot") }),
  });
}

export function buildDurablePopulationCreatedAuditEvent(actor: AuditUserActor, targetId: string, details: { to: string; windowBudget: number; excludeProviderDisabled: boolean }): AuditEventSpec {
  return Object.freeze({
    eventType: AuditEventType.DURABLE_POPULATION_CREATED,
    actor: buildUserActor(actor.actorUserId, actor.actorLoginSnapshot),
    targetType: AuditTargetType.POSITION_HISTORY_POPULATION_RUN,
    targetId: requiredUuid(targetId, "targetId"),
    details: Object.freeze({
      to: requiredTimestamp(details.to, "to"),
      windowBudget: requiredPositiveSafeInteger(details.windowBudget, "windowBudget"),
      excludeProviderDisabled: requiredBoolean(details.excludeProviderDisabled, "excludeProviderDisabled"),
    }),
  });
}

export function buildRetentionExecutedAuditEvent(actor: AuditUserActor, details: { canonicalAnchor: string; policyCutoff: string; deletedCheckpoints: number; deletedObservations: number; remainingFullyObsoleteCheckpoints: number; remainingExecutableObservationCandidates: number; stoppedByBudget: boolean }): AuditEventSpec {
  return Object.freeze({
    eventType: AuditEventType.RETENTION_EXECUTED,
    actor: buildUserActor(actor.actorUserId, actor.actorLoginSnapshot),
    targetType: AuditTargetType.POSITION_HISTORY_RETENTION,
    targetId: null,
    details: Object.freeze({
      canonicalAnchor: requiredTimestamp(details.canonicalAnchor, "canonicalAnchor"),
      policyCutoff: requiredTimestamp(details.policyCutoff, "policyCutoff"),
      deletedCheckpoints: requiredSafeInteger(details.deletedCheckpoints, "deletedCheckpoints"),
      deletedObservations: requiredSafeInteger(details.deletedObservations, "deletedObservations"),
      remainingFullyObsoleteCheckpoints: requiredSafeInteger(details.remainingFullyObsoleteCheckpoints, "remainingFullyObsoleteCheckpoints"),
      remainingExecutableObservationCandidates: requiredSafeInteger(details.remainingExecutableObservationCandidates, "remainingExecutableObservationCandidates"),
      stoppedByBudget: requiredBoolean(details.stoppedByBudget, "stoppedByBudget"),
    }),
  });
}

function parseUserActor(value: unknown): AuditUserActor {
  const actor = object(value, "actor");
  exactKeys(actor, ["actorType", "actorUserId", "actorLoginSnapshot"], "actor");
  if (actor.actorType !== AuditActorType.USER) throw new AuditEventValidationError("the implemented Stage 20A events require a USER actor");
  return buildUserActor(actor.actorUserId as string, actor.actorLoginSnapshot as string);
}

function parseSystemActor(value: unknown): AuditSystemActor {
  const actor = object(value, "actor");
  exactKeys(actor, ["actorType", "actorUserId", "actorLoginSnapshot"], "actor");
  const parsed = assertAuditActor(actor.actorType, actor.actorUserId, actor.actorLoginSnapshot);
  if (parsed.actorType !== AuditActorType.SYSTEM) throw new AuditEventValidationError("expected SYSTEM actor");
  return parsed as AuditSystemActor;
}

export function parseAuditEventSpec(value: unknown): AuditEventSpec {
  const event = object(value, "audit event");
  exactKeys(event, ["eventType", "actor", "targetType", "targetId", "details"], "audit event");
  if (event.eventType !== AuditEventType.USER_DISABLED && event.eventType !== AuditEventType.DURABLE_POPULATION_CREATED && event.eventType !== AuditEventType.RETENTION_EXECUTED) {
    throw new AuditEventValidationError("eventType is not implemented in Stage 20A");
  }
  const actor = parseUserActor(event.actor);

  if (event.eventType === AuditEventType.USER_DISABLED) {
    if (event.targetType !== AuditTargetType.USER) throw new AuditEventValidationError("USER_DISABLED must target USER");
    const details = object(event.details, "details");
    exactKeys(details, ["targetLoginSnapshot"], "USER_DISABLED details");
    return buildUserDisabledAuditEvent(actor, event.targetId as string, details.targetLoginSnapshot as string);
  }

  if (event.eventType === AuditEventType.DURABLE_POPULATION_CREATED) {
    if (event.targetType !== AuditTargetType.POSITION_HISTORY_POPULATION_RUN) throw new AuditEventValidationError("DURABLE_POPULATION_CREATED must target POSITION_HISTORY_POPULATION_RUN");
    const details = object(event.details, "details");
    exactKeys(details, ["to", "windowBudget", "excludeProviderDisabled"], "DURABLE_POPULATION_CREATED details");
    return buildDurablePopulationCreatedAuditEvent(actor, event.targetId as string, {
      to: details.to as string,
      windowBudget: details.windowBudget as number,
      excludeProviderDisabled: details.excludeProviderDisabled as boolean,
    });
  }

  if (event.targetType !== AuditTargetType.POSITION_HISTORY_RETENTION) throw new AuditEventValidationError("RETENTION_EXECUTED must target POSITION_HISTORY_RETENTION");
  if (event.targetId !== null) throw new AuditEventValidationError("RETENTION_EXECUTED targetId must be null");
  const details = object(event.details, "details");
  exactKeys(details, ["canonicalAnchor", "policyCutoff", "deletedCheckpoints", "deletedObservations", "remainingFullyObsoleteCheckpoints", "remainingExecutableObservationCandidates", "stoppedByBudget"], "RETENTION_EXECUTED details");
  return buildRetentionExecutedAuditEvent(actor, {
    canonicalAnchor: details.canonicalAnchor as string,
    policyCutoff: details.policyCutoff as string,
    deletedCheckpoints: details.deletedCheckpoints as number,
    deletedObservations: details.deletedObservations as number,
    remainingFullyObsoleteCheckpoints: details.remainingFullyObsoleteCheckpoints as number,
    remainingExecutableObservationCandidates: details.remainingExecutableObservationCandidates as number,
    stoppedByBudget: details.stoppedByBudget as boolean,
  });
}

export { assertAuditActor as validateAuditActor };
