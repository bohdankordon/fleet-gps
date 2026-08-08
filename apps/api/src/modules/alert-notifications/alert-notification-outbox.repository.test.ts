import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "../../generated/prisma/client";
import type { DatabaseService } from "../database";
import { AlertNotificationOutboxRepository, MAX_PENDING_ALERT_NOTIFICATIONS } from "./alert-notification-outbox.repository";

const CREATED_AT = new Date("2026-08-08T10:00:00.000Z");

test("findPending uses deterministic oldest-first order and returns safe domain rows", async () => {
  let query: unknown;
  const rows = [
    { id: "00000000-0000-4000-8000-000000000001", alertEventId: "00000000-0000-4000-8000-000000000011", kind: "ALERT_CONFIRMED", status: "PENDING", createdAt: CREATED_AT, attemptCount: 0 },
    { id: "00000000-0000-4000-8000-000000000002", alertEventId: "00000000-0000-4000-8000-000000000012", kind: "ALERT_CONFIRMED", status: "PENDING", createdAt: CREATED_AT, attemptCount: 1 },
  ] as const;
  const client = { alertNotificationOutbox: { findMany: async (value: unknown) => { query = value; return rows; } } } as unknown as PrismaClient;
  const repository = new AlertNotificationOutboxRepository({ getClient: () => client } as DatabaseService);

  const result = await repository.findPending(2);

  assert.deepEqual(query, {
    where: { status: "PENDING" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 2,
    select: { id: true, alertEventId: true, kind: true, status: true, createdAt: true, attemptCount: true },
  });
  assert.deepEqual(result, rows);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result[0]), true);
  assert.deepEqual(Object.keys(result[0]!).sort(), ["alertEventId", "attemptCount", "createdAt", "id", "kind", "status"]);
});

test("findPending enforces a bounded positive integer limit before querying", async () => {
  let queries = 0;
  const client = { alertNotificationOutbox: { findMany: async () => { queries += 1; return []; } } } as unknown as PrismaClient;
  const repository = new AlertNotificationOutboxRepository({ getClient: () => client } as DatabaseService);
  for (const limit of [0, -1, 1.5, MAX_PENDING_ALERT_NOTIFICATIONS + 1, Number.NaN]) {
    await assert.rejects(repository.findPending(limit), RangeError);
  }
  assert.equal(queries, 0);
  assert.deepEqual(await repository.findPending(MAX_PENDING_ALERT_NOTIFICATIONS), []);
  assert.equal(queries, 1);
});
