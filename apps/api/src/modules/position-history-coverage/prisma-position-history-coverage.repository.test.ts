import assert from "node:assert/strict";
import test from "node:test";
import { PositionBackfillStatus, type PrismaClient } from "../../generated/prisma/client";
import type { DatabaseService } from "../database/database.service";
import { PrismaPositionHistoryCoverageRepository } from "./prisma-position-history-coverage.repository";

test("uses one set-based inclusive read query with exact checkpoint joins and performs no writes", async () => {
  const from = new Date("2026-08-10T02:00:00Z");
  const to = new Date("2026-08-11T02:00:00Z");
  let reads = 0;
  let writes = 0;
  let query = "";
  const client = {
    $queryRaw: async (sql: { strings?: readonly string[] }) => {
      reads += 1;
      query = sql.strings?.join("?") ?? "";
      return [{ vehicleId: "00000000-0000-4000-8000-000000000001", providerDisabled: true, exactCheckpointStatus: PositionBackfillStatus.PENDING, observationRows: 2n, fleetSyncRows: 1n, historicalBackfillRows: 1n, firstObservedAt: from, lastObservedAt: to }];
    },
    $executeRaw: async () => { writes += 1; },
    vehicle: { update: async () => { writes += 1; } },
    vehiclePositionObservation: { create: async () => { writes += 1; } },
    vehiclePositionBackfillCheckpoint: { update: async () => { writes += 1; } },
  } as unknown as PrismaClient;
  const repository = new PrismaPositionHistoryCoverageRepository({ getClient: () => client } as DatabaseService);
  const rows = await repository.inspect({ from, to });
  assert.equal(reads, 1);
  assert.equal(writes, 0);
  assert.match(query, /observation\.observed_at >=/);
  assert.match(query, /observation\.observed_at <=/);
  assert.match(query, /checkpoint\.range_from =/);
  assert.match(query, /checkpoint\.range_to =/);
  assert.match(query, /GROUP BY observation\.vehicle_id/);
  assert.match(query, /ORDER BY vehicle\.id ASC/);
  assert.equal(rows[0]?.observationRows, 2);
  assert.equal(rows[0]?.exactCheckpointStatus, PositionBackfillStatus.PENDING);
  assert.equal(rows[0]?.providerDisabled, true);
});
