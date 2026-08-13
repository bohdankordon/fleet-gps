import assert from "node:assert/strict";
import test from "node:test";
import { AuditActorType, AuditEventType, AuditTargetType } from "../../generated/prisma/enums";
import { AuditEventValidationError, assertAuditActor, buildDurablePopulationCreatedAuditEvent, buildRetentionExecutedAuditEvent, buildUserActor, buildUserDisabledAuditEvent, parseAuditEventSpec } from "./audit-events";

const actorId = "00000000-0000-4000-8000-000000000001";
const targetId = "00000000-0000-4000-8000-000000000002";
const runId = "00000000-0000-4000-8000-000000000003";
const actor = buildUserActor(actorId, "operator");

test("builders produce the exact three implemented Stage 20A event shapes", () => {
  assert.deepEqual(buildUserDisabledAuditEvent(actor, targetId, "target-operator"), {
    eventType: AuditEventType.USER_DISABLED,
    actor,
    targetType: AuditTargetType.USER,
    targetId,
    details: { targetLoginSnapshot: "target-operator" },
  });
  assert.deepEqual(buildDurablePopulationCreatedAuditEvent(actor, runId, { to: "2026-08-11T02:00:00.000Z", windowBudget: 500, excludeProviderDisabled: true }), {
    eventType: AuditEventType.DURABLE_POPULATION_CREATED,
    actor,
    targetType: AuditTargetType.POSITION_HISTORY_POPULATION_RUN,
    targetId: runId,
    details: { to: "2026-08-11T02:00:00.000Z", windowBudget: 500, excludeProviderDisabled: true },
  });
  assert.deepEqual(buildRetentionExecutedAuditEvent(actor, {
    canonicalAnchor: "2026-08-11T02:00:00.000Z",
    policyCutoff: "2026-05-13T02:00:00.000Z",
    deletedCheckpoints: 2,
    deletedObservations: 3,
    remainingFullyObsoleteCheckpoints: 0,
    remainingExecutableObservationCandidates: 1,
    stoppedByBudget: false,
  }), {
    eventType: AuditEventType.RETENTION_EXECUTED,
    actor,
    targetType: AuditTargetType.POSITION_HISTORY_RETENTION,
    targetId: null,
    details: {
      canonicalAnchor: "2026-08-11T02:00:00.000Z",
      policyCutoff: "2026-05-13T02:00:00.000Z",
      deletedCheckpoints: 2,
      deletedObservations: 3,
      remainingFullyObsoleteCheckpoints: 0,
      remainingExecutableObservationCandidates: 1,
      stoppedByBudget: false,
    },
  });
});

test("unknown top-level, actor, and details fields are rejected", () => {
  const valid = buildUserDisabledAuditEvent(actor, targetId, "target-operator") as unknown as Record<string, unknown>;
  for (const value of [
    { ...valid, password: "secret" },
    { ...valid, actor: { ...(valid.actor as object), password: "secret" } },
    { ...valid, eventType: AuditEventType.USER_CREATED },
  ]) {
    assert.throws(() => parseAuditEventSpec(value), AuditEventValidationError);
  }
  for (const forbidden of ["password", "temporaryPassword", "sessionToken", "cookie", "providerToken", "providerUrl", "coordinates", "fingerprint", "stack", "rawBody"]) {
    assert.throws(() => parseAuditEventSpec({ ...valid, details: { ...(valid.details as object), [forbidden]: "secret" } }), AuditEventValidationError);
  }
});

test("USER actors require a UUID and an auth-policy login snapshot", () => {
  assert.throws(() => buildUserActor("not-a-uuid", "operator"), AuditEventValidationError);
  for (const snapshot of [" ", "ab", "@@@", "x".repeat(65)]) assert.throws(() => buildUserActor(actorId, snapshot), AuditEventValidationError);
  assert.deepEqual(buildUserActor(actorId, "operator-1"), { actorType: AuditActorType.USER, actorUserId: actorId, actorLoginSnapshot: "operator-1" });
});

test("USER_DISABLED target login snapshots use the auth login policy", () => {
  for (const snapshot of [" ", "ab", "@@@", "x".repeat(65)]) assert.throws(() => buildUserDisabledAuditEvent(actor, targetId, snapshot), AuditEventValidationError);
  assert.deepEqual(buildUserDisabledAuditEvent(actor, targetId, "target-operator").details, { targetLoginSnapshot: "target-operator" });
});

test("DURABLE_POPULATION_CREATED requires a positive safe window budget", () => {
  for (const windowBudget of [1, 500, 5_000]) assert.deepEqual(buildDurablePopulationCreatedAuditEvent(actor, runId, { to: "2026-08-11T02:00:00.000Z", windowBudget, excludeProviderDisabled: true }).details, { to: "2026-08-11T02:00:00.000Z", windowBudget, excludeProviderDisabled: true });
  for (const windowBudget of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => buildDurablePopulationCreatedAuditEvent(actor, runId, { to: "2026-08-11T02:00:00.000Z", windowBudget, excludeProviderDisabled: true }), AuditEventValidationError);
});

test("audit timestamps require existing absolute timestamp semantics", () => {
  for (const timestamp of ["2026-08-11", "2026-08-11T02:00:00", "2026-02-30T02:00:00.000Z"]) {
    assert.throws(() => buildDurablePopulationCreatedAuditEvent(actor, runId, { to: timestamp, windowBudget: 500, excludeProviderDisabled: true }), AuditEventValidationError);
    assert.throws(() => buildRetentionExecutedAuditEvent(actor, { canonicalAnchor: timestamp, policyCutoff: "2026-05-13T02:00:00.000Z", deletedCheckpoints: 1, deletedObservations: 0, remainingFullyObsoleteCheckpoints: 0, remainingExecutableObservationCandidates: 0, stoppedByBudget: false }), AuditEventValidationError);
    assert.throws(() => buildRetentionExecutedAuditEvent(actor, { canonicalAnchor: "2026-08-11T02:00:00.000Z", policyCutoff: timestamp, deletedCheckpoints: 1, deletedObservations: 0, remainingFullyObsoleteCheckpoints: 0, remainingExecutableObservationCandidates: 0, stoppedByBudget: false }), AuditEventValidationError);
  }
  assert.deepEqual(buildDurablePopulationCreatedAuditEvent(actor, runId, { to: "2026-08-11T02:00:00.000Z", windowBudget: 500, excludeProviderDisabled: true }).details, { to: "2026-08-11T02:00:00.000Z", windowBudget: 500, excludeProviderDisabled: true });
});

test("SYSTEM actors forbid user identity and login snapshots", () => {
  assert.deepEqual(assertAuditActor(AuditActorType.SYSTEM, null, null), { actorType: AuditActorType.SYSTEM, actorUserId: null, actorLoginSnapshot: null });
  assert.throws(() => assertAuditActor(AuditActorType.SYSTEM, actorId, null), AuditEventValidationError);
  assert.throws(() => assertAuditActor(AuditActorType.SYSTEM, null, "operator"), AuditEventValidationError);
  assert.throws(() => assertAuditActor(AuditActorType.SYSTEM, actorId, "operator"), AuditEventValidationError);
});

test("implemented target contracts reject wrong target types and nullable IDs", () => {
  assert.throws(() => parseAuditEventSpec({ ...buildUserDisabledAuditEvent(actor, targetId, "target"), targetType: AuditTargetType.POSITION_HISTORY }), AuditEventValidationError);
  assert.throws(() => parseAuditEventSpec({ ...buildDurablePopulationCreatedAuditEvent(actor, runId, { to: "2026-08-11T02:00:00.000Z", windowBudget: 500, excludeProviderDisabled: false }), targetType: AuditTargetType.USER }), AuditEventValidationError);
  assert.throws(() => parseAuditEventSpec({ ...buildRetentionExecutedAuditEvent(actor, { canonicalAnchor: "2026-08-11T02:00:00.000Z", policyCutoff: "2026-05-13T02:00:00.000Z", deletedCheckpoints: 1, deletedObservations: 0, remainingFullyObsoleteCheckpoints: 0, remainingExecutableObservationCandidates: 0, stoppedByBudget: false }), targetId: targetId }), AuditEventValidationError);
  assert.throws(() => parseAuditEventSpec({ ...buildUserDisabledAuditEvent(actor, targetId, "target"), targetId: null }), AuditEventValidationError);
});
