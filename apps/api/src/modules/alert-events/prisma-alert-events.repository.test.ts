import assert from "node:assert/strict";
import test from "node:test";
import { Prisma, type PrismaClient } from "../../generated/prisma/client";
import type { DatabaseService } from "../database";
import { PrismaAlertEventsRepository } from "./prisma-alert-events.repository";

const VEHICLE_ID = "00000000-0000-4000-8000-000000000001";
const AT = new Date("2026-08-08T10:00:00.000Z");
const input = { command: { type: "SPEEDING" as const, vehicleId: VEHICLE_ID, observedAt: AT, zone: "CITY" as const, speedKph: 70, speedThresholdKph: 60 }, dedupeKey: "d".repeat(64), activeKey: "a".repeat(64) };

function knownError(target: string[], code = "P2002", modelName?: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("safe", { code, clientVersion: "7.9.1", meta: { target, ...(modelName === undefined ? {} : { modelName }) } });
}

function storedSpeeding(overrides: Record<string, unknown> = {}) {
  return { id: "event-1", vehicleId: VEHICLE_ID, type: "SPEEDING", status: "OPEN", confirmedAt: AT, lastObservedAt: AT, resolvedAt: null, dedupeKey: "d".repeat(64), activeKey: "a".repeat(64), speedZone: "CITY", confirmationSpeedKph: 70, lastSpeedKph: 70, peakSpeedKph: 70, speedThresholdKph: 60, confirmationTraveledDistanceMeters: null, lastTraveledDistanceMeters: null, minimumTraveledDistanceMeters: null, distanceThresholdMeters: null, durationThresholdMinutes: null, ...overrides };
}

test("first confirmation creates event and receipt in the same transaction callback", async () => {
  const receiptCreates: unknown[] = []; let transactions = 0;
  const transaction = {
    alertEventConfirmation: { findUnique: async () => null, create: async (value: unknown) => { receiptCreates.push(value); return {}; } },
    alertEvent: { findFirst: async () => null, create: async () => storedSpeeding() },
  };
  const client = { $transaction: async (callback: (tx: typeof transaction) => Promise<unknown>, options: unknown) => { transactions += 1; assert.deepEqual(options, { timeout: 30_000 }); return callback(transaction); } } as unknown as PrismaClient;
  const result = await new PrismaAlertEventsRepository({ getClient: () => client } as DatabaseService).registerConfirmation(input);
  assert.equal(result.outcome, "CREATED"); assert.equal(transactions, 1); assert.equal(receiptCreates.length, 1);
  assert.deepEqual(receiptCreates[0], { data: { dedupeKey: input.dedupeKey, eventId: "event-1", observedAt: AT } });
});

test("existing stale OPEN still receives a durable receipt without metric update", async () => {
  const receiptCreates: unknown[] = []; let updates = 0;
  const transaction = {
    alertEventConfirmation: { findUnique: async () => null, create: async (value: unknown) => { receiptCreates.push(value); return {}; } },
    alertEvent: { findFirst: async () => storedSpeeding({ lastObservedAt: new Date(AT.getTime() + 10_000) }), updateMany: async () => { updates += 1; return { count: 1 }; } },
  };
  const client = { $transaction: async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction) } as unknown as PrismaClient;
  const result = await new PrismaAlertEventsRepository({ getClient: () => client } as DatabaseService).registerConfirmation(input);
  assert.equal(result.outcome, "ALREADY_OPEN"); if (result.outcome === "ALREADY_OPEN") assert.equal(result.updated, false);
  assert.equal(receiptCreates.length, 1); assert.equal(updates, 0);
});

test("exact replay becomes ALREADY_EXISTS even when race surfaced as active-key conflict", async () => {
  let receiptReads = 0; let openReads = 0;
  const client = {
    $transaction: async () => { throw knownError(["alert_events_active_key_key"]); },
    alertEventConfirmation: { findUnique: async () => { receiptReads += 1; return { eventId: "event-1" }; } },
    alertEvent: { findFirst: async () => { openReads += 1; return storedSpeeding(); } },
  } as unknown as PrismaClient;
  const result = await new PrismaAlertEventsRepository({ getClient: () => client } as DatabaseService).registerConfirmation(input);
  assert.deepEqual(result, { outcome: "ALREADY_EXISTS", eventId: "event-1" }); assert.equal(receiptReads, 1); assert.equal(openReads, 0);
});

test("exact replay becomes ALREADY_EXISTS for a receipt constraint race", async () => {
  const client = { $transaction: async () => { throw knownError(["alert_event_confirmations_pkey"], "P2002", "AlertEventConfirmation"); }, alertEventConfirmation: { findUnique: async () => ({ eventId: "event-1" }) } } as unknown as PrismaClient;
  assert.deepEqual(await new PrismaAlertEventsRepository({ getClient: () => client } as DatabaseService).registerConfirmation(input), { outcome: "ALREADY_EXISTS", eventId: "event-1" });
});

test("does not swallow unrelated Prisma or ordinary errors", async () => {
  for (const error of [knownError(["id"]), knownError(["dedupeKey"], "P2003"), new Error("database failure")]) {
    const client = { $transaction: async () => { throw error; } } as unknown as PrismaClient;
    const repository = new PrismaAlertEventsRepository({ getClient: () => client } as DatabaseService);
    await assert.rejects(repository.registerConfirmation(input), (actual: unknown) => actual === error);
  }
});

test("conditional update includes OPEN status and expected timestamp", async () => {
  let call: unknown;
  const client = { alertEvent: { updateMany: async (value: unknown) => { call = value; return { count: 1 }; } } } as unknown as PrismaClient;
  const repository = new PrismaAlertEventsRepository({ getClient: () => client } as DatabaseService);
  const event = { id: "event", vehicleId: VEHICLE_ID, type: "SPEEDING" as const, status: "OPEN" as const, confirmedAt: AT, lastObservedAt: AT, resolvedAt: null, dedupeKey: "d".repeat(64), activeKey: "a".repeat(64), speedZone: "CITY" as const, confirmationSpeedKph: 70, lastSpeedKph: 70, peakSpeedKph: 70, speedThresholdKph: 60 };
  assert.equal(await repository.updateOpen({ event, command: { type: "SPEEDING", vehicleId: VEHICLE_ID, observedAt: new Date(AT.getTime() + 1_000), speedKph: 80 } }), true);
  assert.deepEqual((call as { where: unknown }).where, { id: "event", status: "OPEN", lastObservedAt: AT });
  assert.equal((call as { data: { peakSpeedKph: number } }).data.peakSpeedKph, 80);
});
