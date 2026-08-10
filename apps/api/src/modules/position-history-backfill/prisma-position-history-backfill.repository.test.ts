import assert from "node:assert/strict";
import test from "node:test";
import { PositionBackfillStatus, PositionIngestionSource, type PrismaClient } from "../../generated/prisma/client";
import { DatabaseService } from "../database/database.service";
import { normalizePositionHistoryCandidate } from "../position-history";
import { PositionHistoryBackfillConcurrentProgressError, PositionHistoryBackfillVehicleNotFoundError } from "./position-history-backfill.errors";
import { PrismaPositionHistoryBackfillRepository } from "./prisma-position-history-backfill.repository";

const vehicleId = "123e4567-e89b-42d3-a456-426614174000";
const from = new Date("2026-08-10T00:00:00Z");
const to = new Date("2026-08-10T01:00:00Z");
const candidate = normalizePositionHistoryCandidate({ observedAt: new Date("2026-08-10T00:30:00Z"), latitude: 49.2, longitude: 28.4, speedKph: 18.52, valid: false, outdated: true, fetchedAt: new Date("2026-08-10T02:00:00Z"), ingestionSource: PositionIngestionSource.HISTORICAL_BACKFILL })!;

test("prepares one durable target checkpoint from public vehicle identity", async () => {
  let where: unknown;
  let upsert: unknown;
  const client = {
    vehicle: { findUnique: async (input: unknown) => { where = input; return { id: vehicleId, externalDeviceId: 7 }; } },
    vehiclePositionBackfillCheckpoint: { upsert: async (input: unknown) => { upsert = input; return { id: "checkpoint", vehicleId, rangeFrom: from, rangeTo: to, nextFrom: from, status: PositionBackfillStatus.PENDING }; } },
  } as unknown as PrismaClient;
  const result = await new PrismaPositionHistoryBackfillRepository({ getClient: () => client } as DatabaseService).prepare({ vehicleId, from, to });
  assert.equal(result.externalDeviceId, 7);
  assert.equal(result.status, PositionBackfillStatus.PENDING);
  assert.deepEqual((where as { select: object }).select, { id: true, externalDeviceId: true });
  assert.deepEqual((upsert as { where: object }).where, { vehicleId_rangeFrom_rangeTo: { vehicleId, rangeFrom: from, rangeTo: to } });
});

test("unknown vehicle fails before checkpoint creation", async () => {
  let checkpoints = 0;
  const client = { vehicle: { findUnique: async () => null }, vehiclePositionBackfillCheckpoint: { upsert: async () => { checkpoints += 1; } } } as unknown as PrismaClient;
  const repository = new PrismaPositionHistoryBackfillRepository({ getClient: () => client } as DatabaseService);
  await assert.rejects(repository.prepare({ vehicleId, from, to }), PositionHistoryBackfillVehicleNotFoundError);
  assert.equal(checkpoints, 0);
});

test("history batch and checkpoint advancement share one transaction with database dedupe", async () => {
  let transactions = 0;
  let timeout = 0;
  let createInput: unknown;
  let updateInput: unknown;
  let currentStateWrites = 0;
  const transaction = {
    vehiclePositionObservation: { createMany: async (input: unknown) => { createInput = input; return { count: 0 }; } },
    vehiclePositionBackfillCheckpoint: { updateMany: async (input: unknown) => { updateInput = input; return { count: 1 }; } },
    vehicleCurrentState: { update: async () => { currentStateWrites += 1; } },
  };
  const client = { $transaction: async (callback: (value: typeof transaction) => Promise<unknown>, options: { timeout: number }) => { transactions += 1; timeout = options.timeout; return callback(transaction); } } as unknown as PrismaClient;
  const repository = new PrismaPositionHistoryBackfillRepository({ getClient: () => client } as DatabaseService);
  const result = await repository.persistWindow({ checkpointId: "checkpoint", vehicleId, expectedNextFrom: from, nextFrom: to, completed: true, candidates: [candidate] });
  assert.deepEqual(result, { inserted: 0, duplicates: 1 });
  assert.equal(transactions, 1);
  assert.equal(timeout, 30_000);
  assert.equal((createInput as { skipDuplicates: boolean }).skipDuplicates, true);
  assert.equal((createInput as { data: Array<{ vehicleId: string; ingestionSource: PositionIngestionSource }> }).data[0]?.vehicleId, vehicleId);
  assert.equal((createInput as { data: Array<{ ingestionSource: PositionIngestionSource }> }).data[0]?.ingestionSource, PositionIngestionSource.HISTORICAL_BACKFILL);
  assert.equal((updateInput as { data: { status: PositionBackfillStatus } }).data.status, PositionBackfillStatus.COMPLETED);
  assert.equal(currentStateWrites, 0);
});

test("empty window advances without history insert and concurrent cursor change rejects atomically", async () => {
  let creates = 0;
  const transaction = {
    vehiclePositionObservation: { createMany: async () => { creates += 1; return { count: 0 }; } },
    vehiclePositionBackfillCheckpoint: { updateMany: async () => ({ count: 0 }) },
  };
  const client = { $transaction: async (callback: (value: typeof transaction) => Promise<unknown>) => callback(transaction) } as unknown as PrismaClient;
  const repository = new PrismaPositionHistoryBackfillRepository({ getClient: () => client } as DatabaseService);
  await assert.rejects(repository.persistWindow({ checkpointId: "checkpoint", vehicleId, expectedNextFrom: from, nextFrom: to, completed: true, candidates: [] }), PositionHistoryBackfillConcurrentProgressError);
  assert.equal(creates, 0);
});
