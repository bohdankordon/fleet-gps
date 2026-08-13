import assert from "node:assert/strict";
import test from "node:test";
import { AuditActorType, AuditEventType, AuditTargetType, type PrismaClient } from "../../generated/prisma/client";
import type { DatabaseService } from "../database/database.service";
import type { AuditReadQuery } from "./audit-read.query";
import { auditReadSelectForTests, PrismaAuditReadRepository } from "./prisma-audit-read.repository";
import { AUDIT_READ_PAGE_SIZE } from "./audit-read.types";

const AT = new Date("2026-08-11T02:00:00.000Z");
const ID = "00000000-0000-4000-8000-000000000050";
const emptyQuery: AuditReadQuery = { eventType: undefined, actorType: undefined, targetType: undefined, from: undefined, to: undefined, cursor: undefined };
function row(index: number) { return { id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`, eventType: AuditEventType.USER_DISABLED, actorType: AuditActorType.USER, actorLoginSnapshot: "operator", targetType: AuditTargetType.USER, targetId: ID, details: { targetLoginSnapshot: "target" }, createdAt: AT }; }

test("performs one bounded read ordered by createdAt/id with no count, offset, joins, or mutation", async () => {
  let args: unknown;
  let reads = 0;
  let writes = 0;
  let counts = 0;
  const rows = Array.from({ length: AUDIT_READ_PAGE_SIZE + 1 }, (_, index) => row(AUDIT_READ_PAGE_SIZE + 1 - index));
  const client = { auditEvent: {
    findMany: async (value: unknown) => { reads += 1; args = value; return rows; },
    count: async () => { counts += 1; return 0; },
    create: async () => { writes += 1; }, update: async () => { writes += 1; }, delete: async () => { writes += 1; },
  } } as unknown as PrismaClient;
  const result = await new PrismaAuditReadRepository({ getClient: () => client } as DatabaseService).list(emptyQuery);
  assert.equal(reads, 1);
  assert.equal(writes, 0);
  assert.equal(counts, 0);
  assert.equal(result.rows.length, 50);
  assert.equal(result.hasMore, true);
  assert.deepEqual(args, { where: {}, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 51, select: auditReadSelectForTests });
  assert.equal("actorUserId" in auditReadSelectForTests, false);
});

test("pushes exact enum, inclusive date, combined, and keyset filters into the set query", async () => {
  const seen: unknown[] = [];
  const client = { auditEvent: { findMany: async (args: unknown) => { seen.push(args); return []; } } } as unknown as PrismaClient;
  const repository = new PrismaAuditReadRepository({ getClient: () => client } as DatabaseService);
  const from = new Date("2026-08-10T00:00:00.000Z");
  const to = new Date("2026-08-12T00:00:00.000Z");
  const cursor = { createdAt: AT, id: ID };
  await repository.list({ ...emptyQuery, eventType: AuditEventType.USER_DISABLED });
  await repository.list({ ...emptyQuery, actorType: AuditActorType.SYSTEM });
  await repository.list({ ...emptyQuery, targetType: AuditTargetType.POSITION_HISTORY_RETENTION });
  await repository.list({ ...emptyQuery, eventType: AuditEventType.RETENTION_EXECUTED, actorType: AuditActorType.USER, targetType: AuditTargetType.POSITION_HISTORY_RETENTION, from, to, cursor });
  const where = seen.map((value) => (value as { where: unknown }).where);
  assert.deepEqual(where[0], { eventType: AuditEventType.USER_DISABLED });
  assert.deepEqual(where[1], { actorType: AuditActorType.SYSTEM });
  assert.deepEqual(where[2], { targetType: AuditTargetType.POSITION_HISTORY_RETENTION });
  assert.deepEqual(where[3], {
    eventType: AuditEventType.RETENTION_EXECUTED,
    actorType: AuditActorType.USER,
    targetType: AuditTargetType.POSITION_HISTORY_RETENTION,
    createdAt: { gte: from, lte: to },
    OR: [{ createdAt: { lt: AT } }, { createdAt: AT, id: { lt: ID } }],
  });
});

test("final page exposes no cursor opportunity", async () => {
  const client = { auditEvent: { findMany: async () => [row(1)] } } as unknown as PrismaClient;
  const result = await new PrismaAuditReadRepository({ getClient: () => client } as DatabaseService).list(emptyQuery);
  assert.equal(result.rows.length, 1);
  assert.equal(result.hasMore, false);
});
