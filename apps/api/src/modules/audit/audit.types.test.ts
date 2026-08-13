import assert from "node:assert/strict";
import test from "node:test";
import { AuditActorType, AuditEventType, AuditTargetType } from "../../generated/prisma/enums";
import { PERMISSIONS } from "../auth/permissions";
import {
  AuditEventValidationError,
  assertAuditActor,
  buildAutomaticRetentionExecutedAuditEvent,
  buildDurablePopulationCreatedAuditEvent,
  buildOwnPasswordChangedAuditEvent,
  buildRetentionExecutedAuditEvent,
  buildShortPopulationExecutedAuditEvent,
  buildSystemPopulationCreatedAuditEvent,
  buildUserAccessChangedAuditEvent,
  buildUserActor,
  buildUserCreatedAuditEvent,
  buildUserDisabledAuditEvent,
  buildUserEnabledAuditEvent,
  buildUserPasswordResetAuditEvent,
  parseAuditEventSpec,
} from "./audit-events";

const actorId = "00000000-0000-4000-8000-000000000001";
const targetId = "00000000-0000-4000-8000-000000000002";
const runId = "00000000-0000-4000-8000-000000000003";
const actor = buildUserActor(actorId, "operator");
const durable = { to: "2026-08-11T02:00:00.000Z", windowBudget: 500, excludeProviderDisabled: true } as const;
const retention = { canonicalAnchor: "2026-08-11T02:00:00.000Z", policyCutoff: "2026-05-13T02:00:00.000Z", deletedCheckpoints: 2, deletedObservations: 3, remainingFullyObsoleteCheckpoints: 0, remainingExecutableObservationCandidates: 1, stoppedByBudget: false } as const;

function specs() {
  return [
    buildUserCreatedAuditEvent(actor, targetId, { targetLoginSnapshot: "target-user", role: "USER", permissions: ["vehicles.view", "trips.view"] }),
    buildUserAccessChangedAuditEvent(actor, targetId, { targetLoginSnapshot: "target-user", previousRole: "USER", role: "ADMIN", previousPermissions: ["reports.view"], permissions: PERMISSIONS }),
    buildUserDisabledAuditEvent(actor, targetId, "target-user"),
    buildUserEnabledAuditEvent(actor, targetId, "target-user"),
    buildUserPasswordResetAuditEvent(actor, targetId, "target-user"),
    buildOwnPasswordChangedAuditEvent(actor),
    buildShortPopulationExecutedAuditEvent(actor, { to: durable.to, windowBudget: 12, excludeProviderDisabled: false, committedWindows: 4 }),
    buildDurablePopulationCreatedAuditEvent(actor, runId, durable),
    buildSystemPopulationCreatedAuditEvent(runId, durable),
    buildRetentionExecutedAuditEvent(actor, retention),
    buildAutomaticRetentionExecutedAuditEvent(retention),
  ];
}

test("builders and parser implement the exact complete approved event catalog", () => {
  assert.deepEqual(specs().map((event) => event.eventType), [
    AuditEventType.USER_CREATED,
    AuditEventType.USER_ACCESS_CHANGED,
    AuditEventType.USER_DISABLED,
    AuditEventType.USER_ENABLED,
    AuditEventType.USER_PASSWORD_RESET,
    AuditEventType.OWN_PASSWORD_CHANGED,
    AuditEventType.SHORT_POPULATION_EXECUTED,
    AuditEventType.DURABLE_POPULATION_CREATED,
    AuditEventType.SYSTEM_POPULATION_CREATED,
    AuditEventType.RETENTION_EXECUTED,
    AuditEventType.AUTOMATIC_RETENTION_EXECUTED,
  ]);
  for (const event of specs()) assert.deepEqual(parseAuditEventSpec(event), event);
});

test("new event details have only their approved exact keys", () => {
  const byType = new Map(specs().map((event) => [event.eventType, Object.keys(event.details)]));
  assert.deepEqual(byType.get(AuditEventType.USER_CREATED), ["targetLoginSnapshot", "role", "permissions"]);
  assert.deepEqual(byType.get(AuditEventType.USER_ACCESS_CHANGED), ["targetLoginSnapshot", "previousRole", "role", "previousPermissions", "permissions"]);
  assert.deepEqual(byType.get(AuditEventType.USER_ENABLED), ["targetLoginSnapshot"]);
  assert.deepEqual(byType.get(AuditEventType.USER_PASSWORD_RESET), ["targetLoginSnapshot"]);
  assert.deepEqual(byType.get(AuditEventType.OWN_PASSWORD_CHANGED), []);
  assert.deepEqual(byType.get(AuditEventType.SHORT_POPULATION_EXECUTED), ["to", "windowBudget", "excludeProviderDisabled", "committedWindows"]);
  assert.deepEqual(byType.get(AuditEventType.SYSTEM_POPULATION_CREATED), ["to", "windowBudget", "excludeProviderDisabled"]);
  assert.deepEqual(byType.get(AuditEventType.AUTOMATIC_RETENTION_EXECUTED), ["canonicalAnchor", "policyCutoff", "deletedCheckpoints", "deletedObservations", "remainingFullyObsoleteCheckpoints", "remainingExecutableObservationCandidates", "stoppedByBudget"]);
});

test("unknown and representative forbidden content cannot enter any event shape", () => {
  const forbidden = ["password", "temporaryPassword", "newPassword", "currentPassword", "passwordHash", "salt", "sessionToken", "sessionId", "cookie", "authorization", "providerToken", "providerUrl", "rawProviderResponse", "rawProviderError", "coordinates", "latitude", "longitude", "fingerprint", "externalDeviceId", "telegramToken", "telegramChatId", "rawBody", "stack"];
  for (const event of specs()) {
    for (const key of forbidden) assert.throws(() => parseAuditEventSpec({ ...event, details: { ...event.details, [key]: "secret" } }), AuditEventValidationError);
  }
  assert.throws(() => parseAuditEventSpec({ ...specs()[0], browserActorId: actorId }), AuditEventValidationError);
});

test("USER and SYSTEM actor contracts remain strict", () => {
  assert.deepEqual(assertAuditActor(AuditActorType.SYSTEM, null, null), { actorType: AuditActorType.SYSTEM, actorUserId: null, actorLoginSnapshot: null });
  for (const identity of [[actorId, null], [null, "operator"], [actorId, "operator"]] as const) assert.throws(() => assertAuditActor(AuditActorType.SYSTEM, identity[0], identity[1]), AuditEventValidationError);
  assert.throws(() => parseAuditEventSpec({ ...buildSystemPopulationCreatedAuditEvent(runId, durable), actor }), AuditEventValidationError);
  assert.throws(() => parseAuditEventSpec({ ...buildUserCreatedAuditEvent(actor, targetId, { targetLoginSnapshot: "target", role: "USER", permissions: [] }), actor: { actorType: "SYSTEM", actorUserId: null, actorLoginSnapshot: null } }), AuditEventValidationError);
});

test("all USER login snapshots reuse the auth login policy", () => {
  for (const snapshot of [" ", "ab", "@@@", "x".repeat(65)]) {
    assert.throws(() => buildUserActor(actorId, snapshot), AuditEventValidationError);
    assert.throws(() => buildUserCreatedAuditEvent(actor, targetId, { targetLoginSnapshot: snapshot, role: "USER", permissions: [] }), AuditEventValidationError);
    assert.throws(() => buildUserEnabledAuditEvent(actor, targetId, snapshot), AuditEventValidationError);
    assert.throws(() => buildUserPasswordResetAuditEvent(actor, targetId, snapshot), AuditEventValidationError);
  }
});

test("roles and permission arrays are exact, dependency-complete, unique, and canonical", () => {
  assert.deepEqual((buildUserCreatedAuditEvent(actor, targetId, { targetLoginSnapshot: "target", role: "ADMIN", permissions: PERMISSIONS }).details as { permissions: readonly string[] }).permissions, PERMISSIONS);
  for (const details of [
    { targetLoginSnapshot: "target", role: "OWNER", permissions: [] },
    { targetLoginSnapshot: "target", role: "USER", permissions: ["unknown"] },
    { targetLoginSnapshot: "target", role: "USER", permissions: ["reports.view", "reports.view"] },
    { targetLoginSnapshot: "target", role: "USER", permissions: ["trips.view", "vehicles.view"] },
    { targetLoginSnapshot: "target", role: "USER", permissions: ["trips.view"] },
    { targetLoginSnapshot: "target", role: "ADMIN", permissions: [] },
  ]) assert.throws(() => buildUserCreatedAuditEvent(actor, targetId, details as never), AuditEventValidationError);
});

test("short population enforces absolute time, the 6/12/24 budget, and factual committed bounds", () => {
  for (const windowBudget of [6, 12, 24]) assert.equal((buildShortPopulationExecutedAuditEvent(actor, { to: durable.to, windowBudget, excludeProviderDisabled: true, committedWindows: windowBudget }).details as { committedWindows: number }).committedWindows, windowBudget);
  for (const windowBudget of [0, 1, 5, 7, 25, 1.5, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => buildShortPopulationExecutedAuditEvent(actor, { to: durable.to, windowBudget, excludeProviderDisabled: true, committedWindows: 0 }), AuditEventValidationError);
  for (const committedWindows of [-1, 7, 1.5, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => buildShortPopulationExecutedAuditEvent(actor, { to: durable.to, windowBudget: 6, excludeProviderDisabled: true, committedWindows }), AuditEventValidationError);
});

test("durable budgets stay positive/safe and all audit timestamps stay absolute", () => {
  for (const windowBudget of [1, 500, 5_000]) assert.equal((buildSystemPopulationCreatedAuditEvent(runId, { ...durable, windowBudget }).details as { windowBudget: number }).windowBudget, windowBudget);
  for (const windowBudget of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => buildDurablePopulationCreatedAuditEvent(actor, runId, { ...durable, windowBudget }), AuditEventValidationError);
  for (const timestamp of ["2026-08-11", "2026-08-11T02:00:00", "2026-02-30T02:00:00.000Z"]) {
    assert.throws(() => buildShortPopulationExecutedAuditEvent(actor, { to: timestamp, windowBudget: 6, excludeProviderDisabled: true, committedWindows: 1 }), AuditEventValidationError);
    assert.throws(() => buildSystemPopulationCreatedAuditEvent(runId, { ...durable, to: timestamp }), AuditEventValidationError);
    assert.throws(() => buildAutomaticRetentionExecutedAuditEvent({ ...retention, canonicalAnchor: timestamp }), AuditEventValidationError);
  }
});

test("target contracts reject wrong types, nullability, and own-password actor mismatch", () => {
  assert.throws(() => parseAuditEventSpec({ ...buildUserEnabledAuditEvent(actor, targetId, "target"), targetType: AuditTargetType.POSITION_HISTORY }), AuditEventValidationError);
  assert.throws(() => parseAuditEventSpec({ ...buildShortPopulationExecutedAuditEvent(actor, { to: durable.to, windowBudget: 6, excludeProviderDisabled: true, committedWindows: 1 }), targetId }), AuditEventValidationError);
  assert.throws(() => parseAuditEventSpec({ ...buildSystemPopulationCreatedAuditEvent(runId, durable), targetType: AuditTargetType.USER }), AuditEventValidationError);
  assert.throws(() => parseAuditEventSpec({ ...buildAutomaticRetentionExecutedAuditEvent(retention), targetId }), AuditEventValidationError);
  assert.throws(() => parseAuditEventSpec({ ...buildOwnPasswordChangedAuditEvent(actor), targetId }), AuditEventValidationError);
});
