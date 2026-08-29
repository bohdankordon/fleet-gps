import assert from "node:assert/strict";
import test from "node:test";
import { Prisma, type PrismaClient } from "../../generated/prisma/client";
import type { DatabaseService } from "../database";
import { PrismaAlertEventsRepository } from "./prisma-alert-events.repository";

const VEHICLE_ID = "00000000-0000-4000-8000-000000000001";
const AT = new Date("2026-08-08T10:00:00.000Z");
const input = { command: { type: "SPEEDING" as const, vehicleId: VEHICLE_ID, observedAt: AT, zone: "CITY" as const, speedKph: 70, speedThresholdKph: 60 }, dedupeKey: "d".repeat(64), activeKey: "a".repeat(64) };
const legacyEnabledConfig = { telegramNotifications: { enabled: true } };

function repository(client: PrismaClient) {
  return new PrismaAlertEventsRepository({ getClient: () => client } as DatabaseService, legacyEnabledConfig);
}

function knownError(target: string[], code = "P2002", modelName?: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("safe", { code, clientVersion: "7.9.1", meta: { target, ...(modelName === undefined ? {} : { modelName }) } });
}

function adapterKnownError(fields: string[]): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("safe", { code: "P2002", clientVersion: "7.9.1", meta: { driverAdapterError: { cause: { constraint: { fields } } } } });
}

function storedSpeeding(overrides: Record<string, unknown> = {}) {
  return { id: "event-1", vehicleId: VEHICLE_ID, type: "SPEEDING", status: "OPEN", confirmedAt: AT, lastObservedAt: AT, resolvedAt: null, dedupeKey: "d".repeat(64), activeKey: "a".repeat(64), speedZone: "CITY", confirmationSpeedKph: 70, lastSpeedKph: 70, peakSpeedKph: 70, speedThresholdKph: 60, confirmationTraveledDistanceMeters: null, lastTraveledDistanceMeters: null, minimumTraveledDistanceMeters: null, distanceThresholdMeters: null, durationThresholdMinutes: null, ...overrides };
}

test("first confirmation creates event and receipt in the same transaction callback", async () => {
  const receiptCreates: unknown[] = []; const notificationCreates: unknown[] = []; const order: string[] = []; let transactions = 0;
  const transaction = {
    alertEventConfirmation: { findUnique: async () => null, create: async (value: unknown) => { order.push("receipt"); receiptCreates.push(value); return {}; } },
    alertEvent: { findFirst: async () => null, create: async () => { order.push("event"); return storedSpeeding(); } },
    alertNotificationOutbox: { create: async (value: unknown) => { order.push("notification"); notificationCreates.push(value); return {}; } },
  };
  const client = { $transaction: async (callback: (tx: typeof transaction) => Promise<unknown>, options: unknown) => { transactions += 1; assert.deepEqual(options, { timeout: 30_000 }); return callback(transaction); } } as unknown as PrismaClient;
  const result = await repository(client as unknown as PrismaClient).registerConfirmation(input);
  assert.equal(result.outcome, "CREATED"); assert.equal(transactions, 1); assert.equal(receiptCreates.length, 1); assert.equal(notificationCreates.length, 1);
  assert.deepEqual(receiptCreates[0], { data: { dedupeKey: input.dedupeKey, eventId: "event-1", observedAt: AT } });
  assert.deepEqual(notificationCreates[0], { data: { alertEventId: "event-1", kind: "ALERT_CONFIRMED" } });
  assert.deepEqual(order, ["event", "receipt", "notification"]);
});

test("legacy-disabled confirmation commits the alert and receipt without creating a legacy outbox intent", async () => {
  let outboxCreates = 0;
  const transaction = {
    alertEventConfirmation: { findUnique: async () => null, create: async () => ({}) },
    alertEvent: { findFirst: async () => null, create: async () => storedSpeeding() },
    alertNotificationOutbox: { create: async () => { outboxCreates += 1; return {}; } },
  };
  const client = { $transaction: async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction) } as unknown as PrismaClient;
  const result = await new PrismaAlertEventsRepository({ getClient: () => client } as DatabaseService, { telegramNotifications: { enabled: false } }).registerConfirmation(input);
  assert.equal(result.outcome, "CREATED");
  assert.equal(outboxCreates, 0);
});

test("existing stale OPEN still receives a durable receipt without metric update", async () => {
  const receiptCreates: unknown[] = []; let updates = 0;
  const transaction = {
    alertEventConfirmation: { findUnique: async () => null, create: async (value: unknown) => { receiptCreates.push(value); return {}; } },
    alertEvent: { findFirst: async () => storedSpeeding({ lastObservedAt: new Date(AT.getTime() + 10_000) }), updateMany: async () => { updates += 1; return { count: 1 }; } },
    alertNotificationOutbox: { create: async () => { throw new Error("must not create notification"); } },
  };
  const client = { $transaction: async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction) } as unknown as PrismaClient;
  const result = await repository(client as unknown as PrismaClient).registerConfirmation(input);
  assert.equal(result.outcome, "ALREADY_OPEN"); if (result.outcome === "ALREADY_OPEN") assert.equal(result.updated, false);
  assert.equal(receiptCreates.length, 1); assert.equal(updates, 0);
});

test("first INACTIVITY confirmation creates exactly one ALERT_CONFIRMED notification", async () => {
  const notificationCreates: unknown[] = [];
  const inactivityInput = { command: { type: "INACTIVITY" as const, vehicleId: VEHICLE_ID, observedAt: AT, traveledDistanceMeters: 10, distanceThresholdMeters: 300, durationThresholdMinutes: 60 }, dedupeKey: "e".repeat(64), activeKey: "b".repeat(64) };
  const client = {
    alertEventConfirmation: { findUnique: async () => null, create: async () => ({}) },
    alertEvent: { findFirst: async () => null, create: async () => ({ id: "event-idle", vehicleId: VEHICLE_ID, type: "INACTIVITY", status: "OPEN", confirmedAt: AT, lastObservedAt: AT, resolvedAt: null, dedupeKey: inactivityInput.dedupeKey, activeKey: inactivityInput.activeKey, speedZone: null, confirmationSpeedKph: null, lastSpeedKph: null, peakSpeedKph: null, speedThresholdKph: null, confirmationTraveledDistanceMeters: 10, lastTraveledDistanceMeters: 10, minimumTraveledDistanceMeters: 10, distanceThresholdMeters: 300, durationThresholdMinutes: 60 }) },
    alertNotificationOutbox: { create: async (value: unknown) => { notificationCreates.push(value); return {}; } },
  } as unknown as PrismaClient;
  const result = await repository(client).registerConfirmation(inactivityInput);
  assert.equal(result.outcome, "CREATED");
  assert.deepEqual(notificationCreates, [{ data: { alertEventId: "event-idle", kind: "ALERT_CONFIRMED" } }]);
});

test("outbox insertion failure rolls back the staged event and confirmation receipt and propagates", async () => {
  const committed = { events: [] as unknown[], receipts: [] as unknown[], notifications: [] as unknown[] };
  const failure = new Error("outbox insert failed");
  const client = {
    $transaction: async (callback: (transaction: unknown) => Promise<unknown>) => {
      const staged = { events: [] as unknown[], receipts: [] as unknown[], notifications: [] as unknown[] };
      const transaction = {
        alertEventConfirmation: { findUnique: async () => null, create: async (value: unknown) => { staged.receipts.push(value); return {}; } },
        alertEvent: { findFirst: async () => null, create: async (value: unknown) => { staged.events.push(value); return storedSpeeding(); } },
        alertNotificationOutbox: { create: async (value: unknown) => { staged.notifications.push(value); throw failure; } },
      };
      const result = await callback(transaction);
      committed.events.push(...staged.events); committed.receipts.push(...staged.receipts); committed.notifications.push(...staged.notifications);
      return result;
    },
  } as unknown as PrismaClient;
  await assert.rejects(repository(client).registerConfirmation(input), (error) => error === failure);
  assert.deepEqual(committed, { events: [], receipts: [], notifications: [] });
});

test("exact replay becomes ALREADY_EXISTS even when race surfaced as active-key conflict", async () => {
  let receiptReads = 0; let openReads = 0;
  const client = {
    $transaction: async () => { throw knownError(["alert_events_active_key_key"]); },
    alertEventConfirmation: { findUnique: async () => { receiptReads += 1; return { eventId: "event-1" }; } },
    alertEvent: { findFirst: async () => { openReads += 1; return storedSpeeding(); } },
  } as unknown as PrismaClient;
  const result = await repository(client).registerConfirmation(input);
  assert.deepEqual(result, { outcome: "ALREADY_EXISTS", eventId: "event-1" }); assert.equal(receiptReads, 1); assert.equal(openReads, 0);
});

test("exact replay becomes ALREADY_EXISTS for a receipt constraint race", async () => {
  const client = { $transaction: async () => { throw knownError(["alert_event_confirmations_pkey"], "P2002", "AlertEventConfirmation"); }, alertEventConfirmation: { findUnique: async () => ({ eventId: "event-1" }) } } as unknown as PrismaClient;
  assert.deepEqual(await repository(client).registerConfirmation(input), { outcome: "ALREADY_EXISTS", eventId: "event-1" });
});

test("Prisma 7 adapter-pg nested unique metadata preserves exact replay semantics", async () => {
  const client = {
    $transaction: async () => { throw adapterKnownError(["active_key"]); },
    alertEventConfirmation: { findUnique: async () => ({ eventId: "event-1" }) },
  } as unknown as PrismaClient;
  assert.deepEqual(await repository(client).registerConfirmation(input), { outcome: "ALREADY_EXISTS", eventId: "event-1" });
});

test("outbox unique P2002 is unrelated and is never swallowed as event idempotency", async () => {
  const error = knownError(["alert_event_id", "kind"], "P2002", "AlertNotificationOutbox");
  const client = { $transaction: async () => { throw error; } } as unknown as PrismaClient;
  await assert.rejects(repository(client).registerConfirmation(input), (actual) => actual === error);
});

test("does not swallow unrelated Prisma or ordinary errors", async () => {
  for (const error of [knownError(["id"]), knownError(["dedupeKey"], "P2003"), new Error("database failure")]) {
    const client = { $transaction: async () => { throw error; } } as unknown as PrismaClient;
    await assert.rejects(repository(client).registerConfirmation(input), (actual: unknown) => actual === error);
  }
});

test("conditional update includes OPEN status and expected timestamp", async () => {
  let call: unknown;
  const client = { alertEvent: { updateMany: async (value: unknown) => { call = value; return { count: 1 }; } } } as unknown as PrismaClient;
  const eventsRepository = repository(client);
  const event = { id: "event", vehicleId: VEHICLE_ID, type: "SPEEDING" as const, status: "OPEN" as const, confirmedAt: AT, lastObservedAt: AT, resolvedAt: null, dedupeKey: "d".repeat(64), activeKey: "a".repeat(64), speedZone: "CITY" as const, confirmationSpeedKph: 70, lastSpeedKph: 70, peakSpeedKph: 70, speedThresholdKph: 60 };
  assert.equal(await eventsRepository.updateOpen({ event, command: { type: "SPEEDING", vehicleId: VEHICLE_ID, observedAt: new Date(AT.getTime() + 1_000), speedKph: 80 } }), true);
  assert.deepEqual((call as { where: unknown }).where, { id: "event", status: "OPEN", lastObservedAt: AT });
  assert.equal((call as { data: { peakSpeedKph: number } }).data.peakSpeedKph, 80);
});
