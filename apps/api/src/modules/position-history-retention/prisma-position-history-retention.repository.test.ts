import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "../../generated/prisma/client";
import type { DatabaseService } from "../database/database.service";
import { PrismaPositionHistoryRetentionRepository } from "./prisma-position-history-retention.repository";

test("uses one set-based read statement with strict observation and inclusive checkpoint boundaries", async () => {
  let reads = 0;
  let writes = 0;
  let query = "";
  const client = {
    $queryRaw: async (sql: { strings?: readonly string[] }) => {
      reads += 1;
      query = sql.strings?.join("?") ?? "";
      return [{
        observationTotal: 7n, observationOlder: 2n, observationProtected: 5n,
        oldestObservedAt: new Date("2026-04-01T00:00:00Z"), newestObservedAt: new Date("2026-08-01T00:00:00Z"), affectedVehicles: 2n,
        checkpointTotal: 6n, fullyObsolete: 1n, boundaryOverlap: 2n, protected: 3n,
        obsoletePending: 0n, obsoleteRunning: 0n, obsoleteCompleted: 1n,
        overlapPending: 1n, overlapRunning: 0n, overlapCompleted: 1n,
        protectedPending: 1n, protectedRunning: 1n, protectedCompleted: 1n,
        endingExactlyAtCutoff: 1n, startingExactlyAtCutoff: 1n, strictlyCrossingCutoff: 1n,
      }];
    },
    $executeRaw: async () => { writes += 1; },
    vehiclePositionObservation: { create: async () => { writes += 1; }, createMany: async () => { writes += 1; }, update: async () => { writes += 1; }, delete: async () => { writes += 1; } },
    vehiclePositionBackfillCheckpoint: { create: async () => { writes += 1; }, update: async () => { writes += 1; }, delete: async () => { writes += 1; } },
    positionHistoryPopulationRun: { create: async () => { writes += 1; }, update: async () => { writes += 1; } },
  } as unknown as PrismaClient;
  const result = await new PrismaPositionHistoryRetentionRepository({ getClient: () => client } as DatabaseService).inspect(new Date("2026-05-13T02:00:00Z"));
  assert.equal(reads, 1);
  assert.equal(writes, 0);
  assert.match(query, /WITH observation_facts/);
  assert.match(query, /observed_at </);
  assert.match(query, /observed_at >=/);
  assert.match(query, /COUNT\(DISTINCT vehicle_id\).*observed_at </s);
  assert.match(query, /range_to </);
  assert.match(query, /range_from < .*range_to >=/s);
  assert.match(query, /range_from >=/);
  assert.match(query, /range_to =/);
  assert.doesNotMatch(query, /\b(?:INSERT|UPDATE|DELETE)\b/i);
  assert.equal(result.observations.olderThanPolicyCutoff, 2);
  assert.equal(result.observations.atOrAfterPolicyCutoff, 5);
  assert.deepEqual(result.checkpoints.boundaryOverlapByStatus, { pending: 1, running: 0, completed: 1 });
  assert.equal(result.checkpoints.endingExactlyAtCutoff, 1);
  assert.equal(result.checkpoints.startingExactlyAtCutoff, 1);
});
