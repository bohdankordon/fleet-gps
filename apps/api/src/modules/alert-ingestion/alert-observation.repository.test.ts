import assert from "node:assert/strict";
import test from "node:test";
import { Prisma, type PrismaClient } from "../../generated/prisma/client";
import type { DatabaseService } from "../database";
import { AlertObservationIdentityConflictError, AlertObservationPersistenceStateError } from "./alert-ingestion.types";
import { AlertObservationRepository } from "./alert-observation.repository";

const VEHICLE_ID = "00000000-0000-4000-8000-000000000071";
const AT = new Date("2026-08-08T10:00:00.000Z");
const observation = Object.freeze({ vehicleId: VEHICLE_ID, observedAt: AT.toISOString(), observedAtMs: AT.getTime(), latitude: 49.2328, longitude: 28.481, speedKph: 72.125 });
const stored = Object.freeze({ id: "journal-1", vehicleId: VEHICLE_ID, observedAt: AT, latitude: 49.2328, longitude: 28.481, speedKph: 72.125, processedAt: null, replayEligible: null, createdAt: new Date("2026-08-08T10:00:01.000Z") });

function uniqueError(target: string[]): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("safe", { code: "P2002", clientVersion: "7.9.1", meta: { target, modelName: "AlertEvaluationObservation" } });
}

test("creates a new immutable journal observation without upsert/update", async () => {
  let createInput: unknown;
  const client = { alertEvaluationObservation: { findUnique: async () => null, create: async (input: unknown) => { createInput = input; return stored; } } } as unknown as PrismaClient;
  const result = await new AlertObservationRepository({ getClient: () => client } as DatabaseService).createOrFindObservation(observation);
  assert.equal(result.outcome, "CREATED");
  assert.deepEqual((createInput as { data: unknown }).data, { vehicleId: VEHICLE_ID, observedAt: AT, latitude: 49.2328, longitude: 28.481, speedKph: 72.125 });
  assert.equal("update" in (client.alertEvaluationObservation as object), false);
});

test("identity unique race returns an identical existing row", async () => {
  let reads = 0;
  const client = { alertEvaluationObservation: { create: async () => { throw uniqueError(["vehicle_id", "observed_at"]); }, findUnique: async () => { reads += 1; return reads === 1 ? null : stored; } } } as unknown as PrismaClient;
  const result = await new AlertObservationRepository({ getClient: () => client } as DatabaseService).createOrFindObservation(observation);
  assert.equal(result.outcome, "EXISTING"); assert.equal(result.observation, stored);
});

test("same vehicle/time with different immutable payload throws a typed conflict", async () => {
  const client = { alertEvaluationObservation: { create: async () => { throw new Error("create must not run"); }, findUnique: async () => ({ ...stored, speedKph: 73 }) } } as unknown as PrismaClient;
  const repository = new AlertObservationRepository({ getClient: () => client } as DatabaseService);
  await assert.rejects(repository.createOrFindObservation(observation), (error: unknown) => error instanceof AlertObservationIdentityConflictError && error.vehicleId === VEHICLE_ID && error.observedAt === AT.toISOString());
});

test("unrelated unique and ordinary Prisma failures are never swallowed", async () => {
  for (const error of [uniqueError(["id"]), new Error("database unavailable")]) {
    const client = { alertEvaluationObservation: { findUnique: async () => null, create: async () => { throw error; } } } as unknown as PrismaClient;
    await assert.rejects(new AlertObservationRepository({ getClient: () => client } as DatabaseService).createOrFindObservation(observation), (actual: unknown) => actual === error);
  }
});

test("recognizes adapter-pg identity fields without swallowing other P2002 constraints", async () => {
  const adapterError = (fields: string[]) => new Prisma.PrismaClientKnownRequestError("safe", {
    code: "P2002",
    clientVersion: "7.9.1",
    meta: { driverAdapterError: { cause: { constraint: { fields } } } },
  });
  let reads = 0;
  const client = { alertEvaluationObservation: {
    findUnique: async () => { reads += 1; return reads === 1 ? null : stored; },
    create: async () => { throw adapterError(["vehicle_id", "observed_at"]); },
  } } as unknown as PrismaClient;
  const result = await new AlertObservationRepository({ getClient: () => client } as DatabaseService).createOrFindObservation(observation);
  assert.equal(result.outcome, "EXISTING");

  const unrelated = adapterError(["id"]);
  const unrelatedClient = { alertEvaluationObservation: { findUnique: async () => null, create: async () => { throw unrelated; } } } as unknown as PrismaClient;
  await assert.rejects(new AlertObservationRepository({ getClient: () => unrelatedClient } as DatabaseService).createOrFindObservation(observation), (error: unknown) => error === unrelated);
});

test("replay query selects only replay-eligible processed rows for anchor, inactivity recent, and speeding latest N", async () => {
  const calls: unknown[] = [];
  const anchor = { ...stored, id: "anchor", observedAt: new Date("2026-08-08T08:59:00.000Z"), processedAt: new Date(), replayEligible: true };
  const recent = [{ ...stored, id: "recent", observedAt: new Date("2026-08-08T09:30:00.000Z"), processedAt: new Date(), replayEligible: true }];
  const speeding = [recent[0]!, { ...stored, id: "speeding", observedAt: new Date("2026-08-08T09:45:00.000Z"), processedAt: new Date(), replayEligible: true }];
  let findManyCalls = 0;
  const client = { alertEvaluationObservation: {
    findFirst: async (input: unknown) => { calls.push(input); return anchor; },
    findMany: async (input: unknown) => { calls.push(input); findManyCalls += 1; return findManyCalls === 1 ? recent : speeding; },
  } } as unknown as PrismaClient;
  const cutoff = new Date("2026-08-08T09:00:00.000Z"); const target = AT;
  const result = await new AlertObservationRepository({ getClient: () => client } as DatabaseService).findReplayState(VEHICLE_ID, cutoff, target, 10);
  assert.deepEqual(result.map((row) => row.id), ["anchor", "recent", "speeding"]);
  assert.deepEqual((calls[0] as { where: unknown }).where, { vehicleId: VEHICLE_ID, processedAt: { not: null }, replayEligible: true, observedAt: { lt: cutoff } });
  assert.deepEqual((calls[1] as { where: unknown }).where, { vehicleId: VEHICLE_ID, processedAt: { not: null }, replayEligible: true, observedAt: { gte: cutoff, lte: target } });
  assert.deepEqual((calls[0] as { orderBy: unknown }).orderBy, { observedAt: "desc" });
  assert.deepEqual((calls[2] as { where: unknown }).where, { vehicleId: VEHICLE_ID, processedAt: { not: null }, replayEligible: true, observedAt: { lte: target } });
  assert.equal((calls[2] as { take: number }).take, 10);
});

test("pending-through query uses the journal index shape and strict timestamp order", async () => {
  let call: unknown;
  const client = { alertEvaluationObservation: { findMany: async (input: unknown) => { call = input; return [stored]; } } } as unknown as PrismaClient;
  const result = await new AlertObservationRepository({ getClient: () => client } as DatabaseService).findPendingThrough(VEHICLE_ID, AT);
  assert.deepEqual(result, [stored]);
  assert.deepEqual((call as { where: unknown }).where, { vehicleId: VEHICLE_ID, processedAt: null, observedAt: { lte: AT } });
  assert.deepEqual((call as { orderBy: unknown }).orderBy, { observedAt: "asc" });
});

test("latest replay state filters completed late rows and orders newest replayable first", async () => {
  let call: unknown;
  const client = { alertEvaluationObservation: { findFirst: async (input: unknown) => { call = input; return stored; } } } as unknown as PrismaClient;
  const result = await new AlertObservationRepository({ getClient: () => client } as DatabaseService).findLatestReplayEligibleObservation(VEHICLE_ID);
  assert.equal(result, stored);
  assert.deepEqual((call as { where: unknown }).where, { vehicleId: VEHICLE_ID, processedAt: { not: null }, replayEligible: true }); assert.deepEqual((call as { orderBy: unknown }).orderBy, { observedAt: "desc" });
});

test("markProcessed atomically stores true/false with parameterized clock_timestamp", async () => {
  for (const replayEligible of [true, false]) {
    let rawStrings: readonly string[] = []; let rawFlag: unknown; let rawId: unknown;
    const client = { alertEvaluationObservation: {
      findUnique: async () => null,
    }, $executeRaw: async (strings: TemplateStringsArray, flag: unknown, id: unknown) => { rawStrings = strings; rawFlag = flag; rawId = id; return 1; } } as unknown as PrismaClient;
    await new AlertObservationRepository({ getClient: () => client } as DatabaseService).markProcessed("journal-1", replayEligible);
    assert.match(rawStrings.join("?"), /SET "processed_at" = clock_timestamp\(\), "replay_eligible" = \?/);
    assert.match(rawStrings.join("?"), /WHERE "id" = \?::uuid AND "processed_at" IS NULL AND "replay_eligible" IS NULL/);
    assert.equal(rawFlag, replayEligible); assert.equal(rawId, "journal-1");
  }
});

test("markProcessed race preserves a matching stored flag and rejects contradictory state", async () => {
  let existing: { processedAt: Date | null; replayEligible: boolean | null } = { processedAt: new Date(), replayEligible: true };
  const client = { alertEvaluationObservation: {
    findUnique: async () => existing,
  }, $executeRaw: async () => 0 } as unknown as PrismaClient;
  const repository = new AlertObservationRepository({ getClient: () => client } as DatabaseService);
  await repository.markProcessed("journal-1", true);
  await assert.rejects(repository.markProcessed("journal-1", false), AlertObservationPersistenceStateError);
  existing = { processedAt: new Date(), replayEligible: null };
  await assert.rejects(repository.markProcessed("journal-1", true), AlertObservationPersistenceStateError);
  existing = { processedAt: null, replayEligible: true };
  await assert.rejects(repository.markProcessed("journal-1", true), AlertObservationPersistenceStateError);
});
