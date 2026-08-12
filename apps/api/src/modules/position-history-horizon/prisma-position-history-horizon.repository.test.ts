import assert from "node:assert/strict";
import test from "node:test";
import { PositionBackfillStatus, type PrismaClient } from "../../generated/prisma/client";
import type { DatabaseService } from "../database/database.service";
import { PrismaPositionHistoryHorizonRepository } from "./prisma-position-history-horizon.repository";

test("reads every target-vehicle pair with one exact-match set query and no writes or overlap inference", async () => {
  const slices = [
    { index: 0, from: new Date("2026-08-01T00:00:00Z"), to: new Date("2026-08-07T00:00:00Z"), durationMs: 6 * 86_400_000 },
    { index: 1, from: new Date("2026-08-07T00:00:00Z"), to: new Date("2026-08-11T00:00:00Z"), durationMs: 4 * 86_400_000 },
  ];
  let reads = 0;
  let writes = 0;
  let query = "";
  const client = {
    $queryRaw: async (sql: { strings?: readonly string[] }) => {
      reads += 1;
      query = sql.strings?.join("?") ?? "";
      return [{ sliceIndex: 0, vehicleId: "00000000-0000-4000-8000-000000000001", providerDisabled: true, exactCheckpointStatus: PositionBackfillStatus.RUNNING, exactCheckpointNextFrom: new Date("2026-08-02T00:00:00Z") }];
    },
    $executeRaw: async () => { writes += 1; },
    vehicle: { update: async () => { writes += 1; } },
    vehiclePositionBackfillCheckpoint: { update: async () => { writes += 1; }, create: async () => { writes += 1; } },
    vehiclePositionObservation: { create: async () => { writes += 1; } },
  } as unknown as PrismaClient;
  const rows = await new PrismaPositionHistoryHorizonRepository({ getClient: () => client } as DatabaseService).inspect(slices);
  assert.equal(reads, 1);
  assert.equal(writes, 0);
  assert.match(query, /WITH targets/);
  assert.match(query, /::integer/);
  assert.equal((query.match(/::timestamptz/g) ?? []).length, slices.length * 2);
  assert.match(query, /CROSS JOIN vehicles/);
  assert.match(query, /checkpoint\.range_from = targets\.range_from/);
  assert.match(query, /checkpoint\.range_to = targets\.range_to/);
  assert.doesNotMatch(query, /checkpoint\.range_from <=|checkpoint\.range_to >=/);
  assert.match(query, /ORDER BY targets\.slice_index ASC, vehicle\.id ASC/);
  assert.equal(rows[0]?.exactCheckpointStatus, PositionBackfillStatus.RUNNING);
  assert.equal(rows[0]?.providerDisabled, true);
});

test("an empty generated target set performs no query", async () => {
  let reads = 0;
  const repository = new PrismaPositionHistoryHorizonRepository({ getClient: () => ({ $queryRaw: async () => { reads += 1; return []; } }) } as unknown as DatabaseService);
  assert.deepEqual(await repository.inspect([]), []);
  assert.equal(reads, 0);
});
