import assert from "node:assert/strict";
import test from "node:test";
import { PositionIngestionSource, type PrismaClient } from "../../generated/prisma/client";
import { DatabaseService } from "../database/database.service";
import { normalizePositionHistoryCandidate } from "../position-history";
import { PositionHistoryIngestionCursorInvalidAdvanceError, PositionHistoryIngestionCursorStaleProgressError, PositionHistoryIngestionCursorVehicleNotFoundError } from "./position-history-ingestion-cursor.errors";
import { PrismaPositionHistoryIngestionCursorRepository } from "./prisma-position-history-ingestion-cursor.repository";

const vehicleId = "123e4567-e89b-42d3-a456-426614174000";
const t0 = new Date("2026-06-09T02:00:00Z");
const t1 = new Date("2026-06-09T02:05:00Z");
const candidate = (source: PositionIngestionSource = PositionIngestionSource.HISTORICAL_BACKFILL, observedAt = new Date("2026-06-09T02:01:00Z")) => normalizePositionHistoryCandidate({ observedAt, latitude: 49.2, longitude: 28.4, speedKph: 18.52, valid: false, outdated: true, fetchedAt: t1, ingestionSource: source })!;

test("ensure is conservative, idempotent, and does not inspect observations or current state", async () => {
  let vehicleSelect: unknown;
  const upserts: unknown[] = [];
  const stored = { vehicleId, coverageFrom: t0, confirmedThrough: t0, createdAt: t1, updatedAt: t1 };
  const client = {
    vehicle: { findUnique: async (input: unknown) => { vehicleSelect = input; return { id: vehicleId }; } },
    vehicleHistoryIngestionCursor: { upsert: async (input: unknown) => { upserts.push(input); return stored; } },
  } as unknown as PrismaClient;
  const repository = new PrismaPositionHistoryIngestionCursorRepository({ getClient: () => client } as DatabaseService);
  assert.deepEqual(await repository.ensureCursor(vehicleId, t0), stored);
  assert.deepEqual(await repository.ensureCursor(vehicleId, new Date("2026-06-16T02:00:00Z")), stored);
  assert.deepEqual((vehicleSelect as { select: unknown }).select, { id: true });
  assert.equal(upserts.length, 2);
  assert.deepEqual((upserts[0] as { create: unknown; update: unknown }).create, { vehicleId, coverageFrom: t0, confirmedThrough: t0 });
  assert.deepEqual((upserts[1] as { update: unknown }).update, {});
  assert.equal("vehiclePositionObservation" in (client as object), false);
  assert.equal("vehicleCurrentState" in (client as object), false);
});

test("unknown vehicle fails before cursor creation", async () => {
  let upserts = 0;
  const client = { vehicle: { findUnique: async () => null }, vehicleHistoryIngestionCursor: { upsert: async () => { upserts += 1; } } } as unknown as PrismaClient;
  const repository = new PrismaPositionHistoryIngestionCursorRepository({ getClient: () => client } as DatabaseService);
  await assert.rejects(repository.ensureCursor(vehicleId, t0), PositionHistoryIngestionCursorVehicleNotFoundError);
  assert.equal(upserts, 0);
});

test("empty windows advance and candidates use createMany skipDuplicates in the same transaction", async () => {
  const operations: string[] = [];
  let createInput: unknown;
  let updateInput: unknown;
  const transaction = {
    vehiclePositionObservation: { createMany: async (input: unknown) => { operations.push("observations"); createInput = input; return { count: 1 }; } },
    vehicleHistoryIngestionCursor: { updateMany: async (input: unknown) => { operations.push("cursor"); updateInput = input; return { count: 1 }; } },
  };
  let timeout = 0;
  const client = { $transaction: async (callback: (value: typeof transaction) => Promise<unknown>, options: { timeout: number }) => { timeout = options.timeout; return callback(transaction); } } as unknown as PrismaClient;
  const repository = new PrismaPositionHistoryIngestionCursorRepository({ getClient: () => client } as DatabaseService);
  assert.deepEqual(await repository.persistContiguousResult({ vehicleId, expectedCoverageFrom: t0, expectedConfirmedThrough: t0, nextConfirmedThrough: t1, candidates: [] }), { inserted: 0, duplicates: 0 });
  assert.deepEqual(operations, ["cursor"]);
  operations.length = 0;
  assert.deepEqual(await repository.persistContiguousResult({ vehicleId, expectedCoverageFrom: t0, expectedConfirmedThrough: t0, nextConfirmedThrough: t1, candidates: [candidate()] }), { inserted: 1, duplicates: 0 });
  assert.deepEqual(operations, ["observations", "cursor"]);
  assert.equal(timeout, 30_000);
  assert.equal((createInput as { skipDuplicates: boolean }).skipDuplicates, true);
  assert.equal((createInput as { data: Array<{ vehicleId: string }> }).data[0]?.vehicleId, vehicleId);
  assert.deepEqual((updateInput as { where: unknown }).where, { vehicleId, coverageFrom: t0, confirmedThrough: t0 });
});

test("database dedupe is source-independent and overlap candidates before expected progress are allowed", async () => {
  const inputs: unknown[] = [];
  const transaction = {
    vehiclePositionObservation: { createMany: async (input: unknown) => { inputs.push(input); return { count: 0 }; } },
    vehicleHistoryIngestionCursor: { updateMany: async () => ({ count: 1 }) },
  };
  const client = { $transaction: async (callback: (value: typeof transaction) => Promise<unknown>) => callback(transaction) } as unknown as PrismaClient;
  const repository = new PrismaPositionHistoryIngestionCursorRepository({ getClient: () => client } as DatabaseService);
  const live = candidate(PositionIngestionSource.FLEET_SYNC, new Date("2026-06-09T01:55:00Z"));
  const historical = { ...live, ingestionSource: PositionIngestionSource.HISTORICAL_BACKFILL };
  const result = await repository.persistContiguousResult({ vehicleId, expectedCoverageFrom: t0, expectedConfirmedThrough: t0, nextConfirmedThrough: t1, candidates: [historical] });
  assert.deepEqual(result, { inserted: 0, duplicates: 1 });
  assert.ok(historical.observedAt < t0);
  assert.equal(historical.fixFingerprint, live.fixFingerprint);
  assert.equal((inputs[0] as { skipDuplicates: boolean }).skipDuplicates, true);
});

test("stale CAS rejects safely and transaction failures propagate for rollback", async () => {
  let rolledBack = false;
  const transaction = {
    vehiclePositionObservation: { createMany: async () => ({ count: 1 }) },
    vehicleHistoryIngestionCursor: { updateMany: async () => ({ count: 0 }) },
  };
  const client = { $transaction: async (callback: (value: typeof transaction) => Promise<unknown>) => {
    try { return await callback(transaction); } catch (error) { rolledBack = true; throw error; }
  } } as unknown as PrismaClient;
  const repository = new PrismaPositionHistoryIngestionCursorRepository({ getClient: () => client } as DatabaseService);
  await assert.rejects(repository.persistContiguousResult({ vehicleId, expectedCoverageFrom: t0, expectedConfirmedThrough: t0, nextConfirmedThrough: t1, candidates: [candidate()] }), PositionHistoryIngestionCursorStaleProgressError);
  assert.equal(rolledBack, true);

  const insertionFailure = new Error("test insertion failure");
  transaction.vehiclePositionObservation.createMany = async () => { throw insertionFailure; };
  transaction.vehicleHistoryIngestionCursor.updateMany = async () => { throw new Error("cursor update must not run"); };
  await assert.rejects(repository.persistContiguousResult({ vehicleId, expectedCoverageFrom: t0, expectedConfirmedThrough: t0, nextConfirmedThrough: t1, candidates: [candidate()] }), insertionFailure);
});

test("coverage-only staleness rejects the CAS and rolls back candidate insertion", async () => {
  let rolledBack = false;
  let where: unknown;
  const transaction = {
    vehiclePositionObservation: { createMany: async () => ({ count: 1 }) },
    vehicleHistoryIngestionCursor: { updateMany: async (input: { where: unknown }) => { where = input.where; return { count: 0 }; } },
  };
  const client = { $transaction: async (callback: (value: typeof transaction) => Promise<unknown>) => {
    try { return await callback(transaction); } catch (error) { rolledBack = true; throw error; }
  } } as unknown as PrismaClient;
  const repository = new PrismaPositionHistoryIngestionCursorRepository({ getClient: () => client } as DatabaseService);
  await assert.rejects(repository.persistContiguousResult({ vehicleId, expectedCoverageFrom: t0, expectedConfirmedThrough: t0, nextConfirmedThrough: t1, candidates: [candidate()] }), PositionHistoryIngestionCursorStaleProgressError);
  assert.deepEqual(where, { vehicleId, coverageFrom: t0, confirmedThrough: t0 });
  assert.equal(rolledBack, true);
});

test("non-finite, equal, and backwards progress are rejected before a transaction", async () => {
  let transactions = 0;
  const client = { $transaction: async () => { transactions += 1; } } as unknown as PrismaClient;
  const repository = new PrismaPositionHistoryIngestionCursorRepository({ getClient: () => client } as DatabaseService);
  for (const next of [new Date(Number.NaN), t0, new Date(t0.getTime() - 1)]) {
    await assert.rejects(repository.persistContiguousResult({ vehicleId, expectedCoverageFrom: t0, expectedConfirmedThrough: t0, nextConfirmedThrough: next, candidates: [] }), PositionHistoryIngestionCursorInvalidAdvanceError);
  }
  await assert.rejects(repository.persistContiguousResult({ vehicleId, expectedCoverageFrom: t1, expectedConfirmedThrough: t0, nextConfirmedThrough: t1, candidates: [] }), PositionHistoryIngestionCursorInvalidAdvanceError);
  assert.equal(transactions, 0);
});
