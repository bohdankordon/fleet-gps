import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "../../generated/prisma/client";
import type { DatabaseService } from "../database";
import { AlertNotificationOutboxRepository, MAX_ALERT_NOTIFICATION_BATCH_SIZE } from "./alert-notification-outbox.repository";
import { AlertNotificationLostLeaseError } from "./alert-notification-outbox.types";

const ID = "00000000-0000-4000-8000-000000000101";
const EVENT_ID = "00000000-0000-4000-8000-000000000102";
const TOKEN = "00000000-0000-4000-8000-000000000103";
const AT = new Date("2026-08-08T10:00:00.000Z");

const rawSpeeding = Object.freeze({
  id: ID,
  alertEventId: EVENT_ID,
  kind: "ALERT_CONFIRMED",
  status: "SENDING",
  createdAt: AT,
  availableAt: AT,
  lockedAt: AT,
  lockToken: TOKEN,
  attemptCount: 1,
  lastAttemptAt: AT,
  alertType: "SPEEDING",
  confirmedAt: AT,
  speedZone: "CITY",
  confirmationSpeedKph: 72,
  speedThresholdKph: 60,
  confirmationTraveledDistanceMeters: null,
  distanceThresholdMeters: null,
  durationThresholdMinutes: null,
  vehicleName: "Taxi Alpha",
});

test("claim is one atomic SKIP LOCKED statement using DB clock, retry availability, and expired leases", async () => {
  let sql = "";
  let values: readonly unknown[] = [];
  const client = {
    applicationSettings: { findUnique: async () => ({ timezone: "Europe/Kyiv" }) },
    $queryRaw: async (strings: TemplateStringsArray, ...parameters: unknown[]) => { sql = strings.join("?"); values = parameters; return [rawSpeeding]; },
  } as unknown as PrismaClient;
  const repository = new AlertNotificationOutboxRepository({ getClient: () => client } as DatabaseService);

  const claimed = await repository.claimNextBatch(10, TOKEN);

  assert.match(sql, /WITH candidates AS/);
  assert.match(sql, /"status" = 'PENDING'.*"available_at" <= clock_timestamp\(\)/s);
  assert.match(sql, /"status" = 'SENDING'.*"locked_at" <= clock_timestamp\(\) - INTERVAL '5 minutes'/s);
  assert.match(sql, /FOR UPDATE OF outbox SKIP LOCKED/);
  assert.match(sql, /UPDATE "alert_notification_outbox"/);
  assert.match(sql, /"attempt_count" = outbox\."attempt_count" \+ 1/);
  assert.match(sql, /"last_attempt_at" = clock_timestamp\(\)/);
  assert.deepEqual(values, [10, TOKEN]);
  assert.equal(sql.includes(TOKEN), false);
  assert.deepEqual(claimed, [{
    id: ID, alertEventId: EVENT_ID, kind: "ALERT_CONFIRMED", status: "SENDING", createdAt: AT, availableAt: AT,
    lockedAt: AT, lockToken: TOKEN, attemptCount: 1, lastAttemptAt: AT, vehicleName: "Taxi Alpha", timezone: "Europe/Kyiv",
    confirmedAt: AT, alertType: "SPEEDING", speedZone: "CITY", confirmationSpeedKph: 72, speedThresholdKph: 60,
  }]);
  assert.equal(Object.isFrozen(claimed), true);
  assert.equal(Object.isFrozen(claimed[0]), true);
});

test("claim validates limit and lock UUID before DB work", async () => {
  let calls = 0;
  const client = { applicationSettings: { findUnique: async () => { calls += 1; return { timezone: "UTC" }; } }, $queryRaw: async () => { calls += 1; return []; } } as unknown as PrismaClient;
  const repository = new AlertNotificationOutboxRepository({ getClient: () => client } as DatabaseService);
  for (const limit of [0, -1, 1.5, MAX_ALERT_NOTIFICATION_BATCH_SIZE + 1, Number.NaN]) await assert.rejects(repository.claimNextBatch(limit, TOKEN), RangeError);
  await assert.rejects(repository.claimNextBatch(1, "not-a-uuid"), TypeError);
  assert.equal(calls, 0);
});

test("markSent requires SENDING plus matching token and clears lease with DB sent clock", async () => {
  let sql = "";
  let values: readonly unknown[] = [];
  const client = { $queryRaw: async (strings: TemplateStringsArray, ...parameters: unknown[]) => { sql = strings.join("?"); values = parameters; return [{ id: ID }]; } } as unknown as PrismaClient;
  await new AlertNotificationOutboxRepository({ getClient: () => client } as DatabaseService).markSent(ID, TOKEN);
  assert.match(sql, /"status" = 'SENT'/);
  assert.match(sql, /"sent_at" = clock_timestamp\(\)/);
  assert.match(sql, /"locked_at" = NULL, "lock_token" = NULL/);
  assert.match(sql, /"status" = 'SENDING' AND "lock_token" = \?::uuid/);
  assert.deepEqual(values, [ID, TOKEN]);
});

test("retry release uses a safe code and DB-clock bounded delay while permanent failure becomes terminal", async () => {
  const calls: Array<{ sql: string; values: readonly unknown[] }> = [];
  const client = { $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => { calls.push({ sql: strings.join("?"), values }); return [{ id: ID }]; } } as unknown as PrismaClient;
  const repository = new AlertNotificationOutboxRepository({ getClient: () => client } as DatabaseService);
  await repository.releaseForRetry(ID, TOKEN, "HTTP_5XX", 60_000);
  await repository.markFailed(ID, TOKEN, "HTTP_4XX");
  assert.match(calls[0]!.sql, /"status" = 'PENDING'/);
  assert.match(calls[0]!.sql, /"available_at" = clock_timestamp\(\) \+ \(\? \* INTERVAL '1 millisecond'\)/);
  assert.deepEqual(calls[0]!.values, [60_000, "HTTP_5XX", ID, TOKEN]);
  assert.match(calls[1]!.sql, /"status" = 'FAILED'/);
  assert.deepEqual(calls[1]!.values, ["HTTP_4XX", ID, TOKEN]);
});

test("wrong or stale lock token produces a typed lost-lease error", async () => {
  const client = { $queryRaw: async () => [] } as unknown as PrismaClient;
  const repository = new AlertNotificationOutboxRepository({ getClient: () => client } as DatabaseService);
  await assert.rejects(repository.markSent(ID, TOKEN), AlertNotificationLostLeaseError);
  await assert.rejects(repository.releaseForRetry(ID, TOKEN, "NETWORK", 60_000), AlertNotificationLostLeaseError);
  await assert.rejects(repository.markFailed(ID, TOKEN, "HTTP_4XX"), AlertNotificationLostLeaseError);
});
