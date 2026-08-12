import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "../../generated/prisma/client";
import type { DatabaseService } from "../database/database.service";
import { PrismaPositionHistoryStatusObservationRepository } from "./prisma-position-history-status-observation.repository";

test("uses one bounded set aggregate and performs no writes", async () => {
  let reads = 0;
  let writes = 0;
  let query = "";
  const client = {
    $queryRaw: async (sql: { strings?: readonly string[] }) => { reads += 1; query = sql.strings?.join("?") ?? ""; return [{ rowCount: 5n, vehiclesWithObservations: 2n, firstObservationAt: new Date("2026-08-01T00:00:00Z"), lastObservationAt: new Date("2026-08-02T00:00:00Z") }]; },
    $executeRaw: async () => { writes += 1; },
    vehiclePositionObservation: { create: async () => { writes += 1; }, createMany: async () => { writes += 1; }, update: async () => { writes += 1; }, delete: async () => { writes += 1; } },
    vehiclePositionBackfillCheckpoint: { create: async () => { writes += 1; }, update: async () => { writes += 1; } },
  } as unknown as PrismaClient;
  const result = await new PrismaPositionHistoryStatusObservationRepository({ getClient: () => client } as DatabaseService).inspect(new Date("2026-08-01T00:00:00Z"), new Date("2026-08-02T00:00:00Z"));
  assert.equal(reads, 1);
  assert.equal(writes, 0);
  assert.match(query, /COUNT\(\*\)/);
  assert.match(query, /COUNT\(DISTINCT observation\.vehicle_id\)/);
  assert.match(query, /observation\.observed_at >=/);
  assert.match(query, /observation\.observed_at <=/);
  assert.doesNotMatch(query, /INSERT|UPDATE|DELETE/i);
  assert.deepEqual(result, { rowCount: 5, vehiclesWithObservations: 2, firstObservationAt: new Date("2026-08-01T00:00:00Z"), lastObservationAt: new Date("2026-08-02T00:00:00Z") });
});
