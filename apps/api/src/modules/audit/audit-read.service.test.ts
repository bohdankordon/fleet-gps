import assert from "node:assert/strict";
import test from "node:test";
import { AuditActorType, AuditEventType, AuditTargetType, AuthRole } from "../../generated/prisma/enums";
import { PERMISSIONS } from "../auth/permissions";
import { parseAuditReadQuery } from "./audit-read.query";
import type { AuditReadRepository, StoredAuditReadRow } from "./audit-read.repository";
import { AuditReadService } from "./audit-read.service";

const ACTOR_ID = "00000000-0000-4000-8000-000000000001";
const TARGET_ID = "00000000-0000-4000-8000-000000000002";
const RUN_ID = "00000000-0000-4000-8000-000000000003";
const AT = new Date("2026-08-11T02:00:00.000Z");
const retention = { canonicalAnchor: AT.toISOString(), policyCutoff: "2026-05-13T02:00:00.000Z", deletedCheckpoints: 1, deletedObservations: 2, remainingFullyObsoleteCheckpoints: 3, remainingExecutableObservationCandidates: 4, stoppedByBudget: true };

function stored(eventType: AuditEventType, details: unknown, index = 1): StoredAuditReadRow {
  const system = eventType === AuditEventType.SYSTEM_POPULATION_CREATED || eventType === AuditEventType.AUTOMATIC_RETENTION_EXECUTED;
  const userTargetEvents: readonly AuditEventType[] = [AuditEventType.USER_CREATED, AuditEventType.USER_ACCESS_CHANGED, AuditEventType.USER_DISABLED, AuditEventType.USER_ENABLED, AuditEventType.USER_PASSWORD_RESET, AuditEventType.OWN_PASSWORD_CHANGED];
  const userTarget = userTargetEvents.includes(eventType);
  const runTarget = eventType === AuditEventType.DURABLE_POPULATION_CREATED || eventType === AuditEventType.SYSTEM_POPULATION_CREATED;
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    eventType,
    actorType: system ? AuditActorType.SYSTEM : AuditActorType.USER,
    actorLoginSnapshot: system ? null : "operator",
    targetType: userTarget ? AuditTargetType.USER : runTarget ? AuditTargetType.POSITION_HISTORY_POPULATION_RUN : eventType === AuditEventType.SHORT_POPULATION_EXECUTED ? AuditTargetType.POSITION_HISTORY : eventType === AuditEventType.SETTINGS_UPDATED ? AuditTargetType.APPLICATION_SETTINGS : AuditTargetType.POSITION_HISTORY_RETENTION,
    targetId: userTarget ? (eventType === AuditEventType.OWN_PASSWORD_CHANGED ? ACTOR_ID : TARGET_ID) : runTarget ? RUN_ID : eventType === AuditEventType.SETTINGS_UPDATED ? "1" : null,
    details,
    createdAt: new Date(AT.getTime() - index),
  };
}

const validRows: readonly StoredAuditReadRow[] = [
  stored(AuditEventType.USER_CREATED, { targetLoginSnapshot: "target", role: AuthRole.USER, permissions: ["fleet.view"] }, 1),
  stored(AuditEventType.USER_ACCESS_CHANGED, { targetLoginSnapshot: "target", previousRole: AuthRole.USER, role: AuthRole.ADMIN, previousPermissions: ["fleet.view"], permissions: PERMISSIONS }, 2),
  stored(AuditEventType.USER_DISABLED, { targetLoginSnapshot: "target" }, 3),
  stored(AuditEventType.USER_ENABLED, { targetLoginSnapshot: "target" }, 4),
  stored(AuditEventType.USER_PASSWORD_RESET, { targetLoginSnapshot: "target" }, 5),
  stored(AuditEventType.OWN_PASSWORD_CHANGED, {}, 6),
  stored(AuditEventType.SHORT_POPULATION_EXECUTED, { to: AT.toISOString(), windowBudget: 24, excludeProviderDisabled: true, committedWindows: 6 }, 7),
  stored(AuditEventType.DURABLE_POPULATION_CREATED, { to: AT.toISOString(), windowBudget: 500, excludeProviderDisabled: false }, 8),
  stored(AuditEventType.RETENTION_EXECUTED, retention, 9),
  stored(AuditEventType.SYSTEM_POPULATION_CREATED, { to: AT.toISOString(), windowBudget: 5000, excludeProviderDisabled: true }, 10),
  stored(AuditEventType.AUTOMATIC_RETENTION_EXECUTED, retention, 11),
  stored(AuditEventType.SETTINGS_UPDATED, { changes: [{ field: "timezone", previous: "Europe/Kyiv", next: "UTC" }] }, 12),
];

function service(rows: readonly StoredAuditReadRow[], hasMore = false): AuditReadService {
  return new AuditReadService({ list: async () => ({ rows, hasMore }) } satisfies AuditReadRepository);
}

test("maps all audit event types to safe actor, target, and validated available details", async () => {
  const response = await service(validRows).list(parseAuditReadQuery({}));
  assert.equal(response.items.length, 12);
  assert.deepEqual(response.items.map((item) => item.eventType), Object.values(AuditEventType));
  assert.equal(response.items.every((item) => item.details.status === "AVAILABLE"), true);
  assert.deepEqual(response.items[0]?.actor, { type: "USER", login: "operator" });
  assert.deepEqual(response.items[9]?.actor, { type: "SYSTEM" });
  assert.equal(JSON.stringify(response).includes("actorUserId"), false);
});

test("malformed details stay row-local and forbidden fields never pass through", async () => {
  const forbidden = { password: "fixture-password-secret", temporaryPassword: "fixture-temporary-secret", sessionToken: "fixture-session-secret", cookie: "fixture-cookie-secret", providerToken: "fixture-provider-token", providerUrl: "fixture-provider-url", coordinates: "fixture-coordinates", latitude: "fixture-latitude", longitude: "fixture-longitude", fingerprint: "fixture-fingerprint", externalDeviceId: "fixture-external-device", telegramToken: "fixture-telegram", rawBody: "fixture-raw-body", stack: "fixture-stack", DATABASE_URL: "fixture-database-url" };
  const malformed = stored(AuditEventType.USER_DISABLED, { targetLoginSnapshot: "target", ...forbidden }, 20);
  const response = await service([validRows[2]!, malformed, validRows[3]!]).list(parseAuditReadQuery({}));
  assert.deepEqual(response.items.map((item) => item.details.status), ["AVAILABLE", "UNAVAILABLE", "AVAILABLE"]);
  const serialized = JSON.stringify(response);
  for (const secret of Object.values(forbidden)) assert.equal(serialized.includes(secret), false, secret);
  assert.equal(serialized.includes("targetLoginSnapshot"), true);
});

test("next cursor belongs to the last returned row only when more rows exist", async () => {
  const page = await service(validRows.slice(0, 2), true).list(parseAuditReadQuery({}));
  assert.equal(page.hasMore, true);
  assert.notEqual(page.nextCursor, null);
  const decoded = page.nextCursor === null ? undefined : parseAuditReadQuery({ cursor: page.nextCursor }).cursor;
  assert.deepEqual(decoded, { createdAt: validRows[1]!.createdAt, id: validRows[1]!.id });
  const final = await service(validRows.slice(0, 1)).list(parseAuditReadQuery({}));
  assert.deepEqual({ hasMore: final.hasMore, nextCursor: final.nextCursor }, { hasMore: false, nextCursor: null });
});
