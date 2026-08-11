import assert from "node:assert/strict";
import test from "node:test";
import { PositionBackfillStatus, type PrismaClient } from "../../generated/prisma/client";
import { DatabaseService } from "../database/database.service";
import { PrismaPositionHistoryFleetBackfillRepository } from "./prisma-position-history-fleet-backfill.repository";

test("inspects exact target checkpoints in stable public UUID order using one read-only query", async () => {
  const from = new Date("2026-08-01T00:00:00.000Z");
  const to = new Date("2026-08-01T02:00:00.000Z");
  let query: unknown;
  let writes = 0;
  const client = {
    vehicle: {
      findMany: async (input: unknown) => {
        query = input;
        return [
          { id: "00000000-0000-4000-8000-000000000001", externalDeviceId: 7, positionBackfillCheckpoints: [] },
          { id: "00000000-0000-4000-8000-000000000002", externalDeviceId: 8, positionBackfillCheckpoints: [{ nextFrom: to, status: PositionBackfillStatus.COMPLETED }] },
        ];
      },
      update: async () => { writes += 1; },
    },
    vehiclePositionBackfillCheckpoint: { upsert: async () => { writes += 1; } },
  } as unknown as PrismaClient;
  const repository = new PrismaPositionHistoryFleetBackfillRepository({ getClient: () => client } as DatabaseService);
  const rows = await repository.inspect({ from, to });
  assert.deepEqual(rows.map((row) => row.vehicleId), ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"]);
  assert.equal(rows[0]?.checkpoint, null);
  assert.equal(rows[1]?.checkpoint?.status, PositionBackfillStatus.COMPLETED);
  const args = query as { orderBy: unknown; select: { positionBackfillCheckpoints: { where: unknown; take: number } } };
  assert.deepEqual(args.orderBy, { id: "asc" });
  assert.deepEqual(args.select.positionBackfillCheckpoints.where, { rangeFrom: from, rangeTo: to });
  assert.equal(args.select.positionBackfillCheckpoints.take, 1);
  assert.equal(writes, 0);
});
