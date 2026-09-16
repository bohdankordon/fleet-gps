import assert from "node:assert/strict";
import test from "node:test";
import { Prisma, type PrismaClient } from "../../generated/prisma/client";
import type { DatabaseService } from "../database";
import { PrismaAlertEventsRepository } from "./prisma-alert-events.repository";
import { createAlertEventDedupeKey } from "./alert-events.keys";
import { AlertEventPersistenceStateError } from "./alert-events.repository";

const VEHICLE_ID = "00000000-0000-4000-8000-000000000001";
const AT = new Date("2026-08-08T10:00:00.000Z");
const input = { command: { type: "SPEEDING" as const, vehicleId: VEHICLE_ID, observedAt: AT, zone: "CITY" as const, speedKph: 70, speedThresholdKph: 60, confirmationLatitude: 49.23, confirmationLongitude: 28.48, speedingStreakStartedAt: new Date(AT.getTime() - 1_000), speedingStreakStartLatitude: 49.22, speedingStreakStartLongitude: 28.47 }, dedupeKey: "d".repeat(64), activeKey: "a".repeat(64) };
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
  return { id: "event-1", vehicleId: VEHICLE_ID, type: "SPEEDING", status: "OPEN", confirmedAt: AT, lastObservedAt: AT, resolvedAt: null, dedupeKey: "d".repeat(64), activeKey: "a".repeat(64), speedZone: "CITY", confirmationSpeedKph: 70, confirmationLatitude: 49.23, confirmationLongitude: 28.48, lastSpeedKph: 70, peakSpeedKph: 70, speedThresholdKph: 60, confirmationTraveledDistanceMeters: null, lastTraveledDistanceMeters: null, minimumTraveledDistanceMeters: null, distanceThresholdMeters: null, durationThresholdMinutes: null, ...overrides };
}

function storedReceipt(overrides: Record<string, unknown> = {}) {
  return { eventId: "event-1", observedAt: AT, speedingStreakStartedAt: input.command.speedingStreakStartedAt, speedingStreakStartLatitude: 49.22, speedingStreakStartLongitude: 28.47, lastSpeedingObservedAt: AT, lastSpeedingLatitude: 49.23, lastSpeedingLongitude: 28.48, ...overrides };
}

test("first confirmation creates event and receipt in the same transaction callback", async () => {
  const eventCreates: unknown[] = []; const receiptCreates: unknown[] = []; const notificationCreates: unknown[] = []; const order: string[] = []; let transactions = 0;
  const transaction = {
    alertEventConfirmation: { findUnique: async () => null, create: async (value: unknown) => { order.push("receipt"); receiptCreates.push(value); return {}; } },
    alertEvent: { findFirst: async () => null, create: async (value: unknown) => { order.push("event"); eventCreates.push(value); return storedSpeeding(); } },
    alertNotificationOutbox: { create: async (value: unknown) => { order.push("notification"); notificationCreates.push(value); return {}; } },
  };
  const client = { $transaction: async (callback: (tx: typeof transaction) => Promise<unknown>, options: unknown) => { transactions += 1; assert.deepEqual(options, { timeout: 30_000 }); return callback(transaction); } } as unknown as PrismaClient;
  const result = await repository(client as unknown as PrismaClient).registerConfirmation(input);
  assert.equal(result.outcome, "CREATED"); assert.equal(transactions, 1); assert.equal(receiptCreates.length, 1); assert.equal(notificationCreates.length, 1);
  assert.deepEqual(receiptCreates[0], { data: { dedupeKey: input.dedupeKey, eventId: "event-1", observedAt: AT, speedingStreakStartedAt: input.command.speedingStreakStartedAt, speedingStreakStartLatitude: 49.22, speedingStreakStartLongitude: 28.47, lastSpeedingObservedAt: AT, lastSpeedingLatitude: 49.23, lastSpeedingLongitude: 28.48 } });
  assert.deepEqual(notificationCreates[0], { data: { alertEventId: "event-1", kind: "ALERT_CONFIRMED" } });
  const persisted = (eventCreates[0] as { data: Record<string, unknown> }).data;
  assert.equal(persisted.confirmedAt, AT); assert.equal(persisted.confirmationSpeedKph, 70); assert.equal(persisted.confirmationLatitude, 49.23); assert.equal(persisted.confirmationLongitude, 28.48);
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
    alertEventConfirmation: { findUnique: async () => { receiptReads += 1; return storedReceipt(); } },
    alertEvent: { findFirst: async () => { openReads += 1; return storedSpeeding(); } },
  } as unknown as PrismaClient;
  const result = await repository(client).registerConfirmation(input);
  assert.deepEqual(result, { outcome: "ALREADY_EXISTS", eventId: "event-1" }); assert.equal(receiptReads, 1); assert.equal(openReads, 0);
});

test("exact replay becomes ALREADY_EXISTS for a receipt constraint race", async () => {
  const client = { $transaction: async () => { throw knownError(["alert_event_confirmations_pkey"], "P2002", "AlertEventConfirmation"); }, alertEventConfirmation: { findUnique: async () => storedReceipt() } } as unknown as PrismaClient;
  assert.deepEqual(await repository(client).registerConfirmation(input), { outcome: "ALREADY_EXISTS", eventId: "event-1" });
});

test("exact confirmation replay remains idempotent after its mutable segment endpoint advanced", async () => {
  const extended = storedReceipt({ lastSpeedingObservedAt: new Date(AT.getTime() + 30_000), lastSpeedingLatitude: 49.25, lastSpeedingLongitude: 28.5 });
  const client = { alertEventConfirmation: { findUnique: async () => extended }, alertEvent: { findFirst: async () => { throw new Error("must not inspect another event"); } } } as unknown as PrismaClient;
  assert.deepEqual(await repository(client).registerConfirmation(input), { outcome: "ALREADY_EXISTS", eventId: "event-1" });
});

test("Prisma 7 adapter-pg nested unique metadata preserves exact replay semantics", async () => {
  const client = {
    $transaction: async () => { throw adapterKnownError(["active_key"]); },
    alertEventConfirmation: { findUnique: async () => storedReceipt() },
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
  let call: unknown; let receiptCall: unknown;
  const client = { alertEvent: { updateMany: async (value: unknown) => { call = value; return { count: 1 }; } }, alertEventConfirmation: { updateMany: async (value: unknown) => { receiptCall = value; return { count: 1 }; } } } as unknown as PrismaClient;
  const eventsRepository = repository(client);
  const event = { id: "event", vehicleId: VEHICLE_ID, type: "SPEEDING" as const, status: "OPEN" as const, confirmedAt: AT, lastObservedAt: AT, resolvedAt: null, dedupeKey: "d".repeat(64), activeKey: "a".repeat(64), speedZone: "CITY" as const, confirmationSpeedKph: 70, confirmationLatitude: 49.23, confirmationLongitude: 28.48, lastSpeedKph: 70, peakSpeedKph: 70, speedThresholdKph: 60 };
  const activeAt = new Date(AT.getTime() + 1_000);
  assert.equal(await eventsRepository.updateOpen({ event, command: { type: "SPEEDING", vehicleId: VEHICLE_ID, observedAt: activeAt, speedKph: 80, latitude: 49.24, longitude: 28.49, confirmationObservedAt: AT } }), true);
  assert.deepEqual((call as { where: unknown }).where, { id: "event", status: "OPEN", lastObservedAt: AT });
  assert.equal((call as { data: { peakSpeedKph: number } }).data.peakSpeedKph, 80);
  assert.equal("confirmationLatitude" in (call as { data: Record<string, unknown> }).data, false);
  assert.equal("confirmationLongitude" in (call as { data: Record<string, unknown> }).data, false);
  assert.deepEqual((receiptCall as { data: unknown }).data, { lastSpeedingObservedAt: activeAt, lastSpeedingLatitude: 49.24, lastSpeedingLongitude: 28.49 });
  assert.deepEqual((receiptCall as { where: unknown }).where, { dedupeKey: createAlertEventDedupeKey("SPEEDING", VEHICLE_ID, AT), eventId: "event", observedAt: AT, speedingStreakStartedAt: { not: null }, lastSpeedingObservedAt: { lte: activeAt } });
});

test("ACTIVE fails atomically when its exact confirmation receipt cannot be extended", async () => {
  const event = storedSpeeding({ id: "event" }) as unknown as import("./alert-events.types").SpeedingAlertEventRecord;
  const transaction = { alertEvent: { updateMany: async () => ({ count: 1 }) }, alertEventConfirmation: { updateMany: async () => ({ count: 0 }) } };
  const client = { $transaction: async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction) } as unknown as PrismaClient;
  await assert.rejects(repository(client).updateOpen({ event, command: { type: "SPEEDING", vehicleId: VEHICLE_ID, observedAt: new Date(AT.getTime() + 1_000), speedKph: 80, latitude: 49.24, longitude: 28.49, confirmationObservedAt: AT } }), AlertEventPersistenceStateError);
});

test("equal-timestamp ACTIVE retry verifies the exact confirmation endpoint and rejects contradiction", async () => {
  const activeAt = new Date(AT.getTime() + 1_000);
  const event = storedSpeeding({ id: "event", lastObservedAt: activeAt, lastSpeedKph: 80 }) as unknown as import("./alert-events.types").SpeedingAlertEventRecord;
  let receipt = storedReceipt({ eventId: "event", lastSpeedingObservedAt: activeAt, lastSpeedingLatitude: 49.24, lastSpeedingLongitude: 28.49 });
  const client = { alertEventConfirmation: { findUnique: async () => receipt } } as unknown as PrismaClient;
  const command = { type: "SPEEDING" as const, vehicleId: VEHICLE_ID, observedAt: activeAt, speedKph: 80, latitude: 49.24, longitude: 28.49, confirmationObservedAt: AT };
  assert.equal(await repository(client).verifySpeedingUpdateApplied(event, command), true);
  receipt = storedReceipt({ eventId: "event", lastSpeedingObservedAt: activeAt, lastSpeedingLatitude: 49.99, lastSpeedingLongitude: 28.49 });
  await assert.rejects(repository(client).verifySpeedingUpdateApplied(event, command), AlertEventPersistenceStateError);
});

test("resolve preserves the speeding confirmation anchor and only closes the event", async () => {
  let call: unknown;
  const client = { alertEvent: { updateMany: async (value: unknown) => { call = value; return { count: 1 }; } } } as unknown as PrismaClient;
  const eventsRepository = repository(client);
  const event = { id: "event", vehicleId: VEHICLE_ID, type: "SPEEDING" as const, status: "OPEN" as const, confirmedAt: AT, lastObservedAt: AT, resolvedAt: null, dedupeKey: "d".repeat(64), activeKey: "a".repeat(64), speedZone: "CITY" as const, confirmationSpeedKph: 70, confirmationLatitude: 49.23, confirmationLongitude: 28.48, lastSpeedKph: 70, peakSpeedKph: 70, speedThresholdKph: 60 };
  const resolvedAt = new Date(AT.getTime() + 60_000);
  assert.equal(await eventsRepository.resolveOpen({ event, command: { type: "SPEEDING", vehicleId: VEHICLE_ID, observedAt: resolvedAt, speedKph: 40 } }), true);
  const data = (call as { data: Record<string, unknown> }).data;
  assert.equal(data.status, "RESOLVED");
  assert.equal(data.resolvedAt, resolvedAt);
  assert.equal("confirmationLatitude" in data, false);
  assert.equal("confirmationLongitude" in data, false);
  assert.equal("confirmationSpeedKph" in data, false);
  assert.equal("confirmedAt" in data, false);
});
