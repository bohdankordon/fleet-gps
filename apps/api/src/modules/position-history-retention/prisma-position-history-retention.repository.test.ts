import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { PrismaClient } from "../../generated/prisma/client";
import type { DatabaseService } from "../database/database.service";
import { PrismaPositionHistoryRetentionRepository } from "./prisma-position-history-retention.repository";

test("normal status uses bounded observation probes and inclusive checkpoint classifications", async () => {
  let reads = 0;
  let writes = 0;
  let query = "";
  const client = {
    $queryRaw: async (sql: { strings?: readonly string[] }) => {
      reads += 1;
      query = sql.strings?.join("?") ?? "";
      return [{
        oldestObservedAt: new Date("2026-04-01T00:00:00Z"), newestObservedAt: new Date("2026-08-01T00:00:00Z"), hasExecutableObservationWork: true,
        cursorFloorCandidates: 3n, replayCheckpointCandidates: 4n,
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
  assert.match(query, /EXISTS[\s\S]*LIMIT 1/);
  assert.match(query, /ORDER BY observed_at ASC LIMIT 1/);
  assert.match(query, /ORDER BY observed_at DESC LIMIT 1/);
  assert.doesNotMatch(query, /COUNT\(DISTINCT/);
  assert.doesNotMatch(query, /COUNT\(\*\)\s+FROM vehicle_position_observations/);
  assert.match(query, /range_to </);
  assert.match(query, /range_from < .*range_to >=/s);
  assert.match(query, /range_from >=/);
  assert.match(query, /range_to =/);
  assert.doesNotMatch(query, /\b(?:INSERT|UPDATE|DELETE)\b/i);
  assert.equal(result.observations.hasExecutableWork, true);
  assert.deepEqual(result.policyReconciliation, { cursorFloorCandidates: 3, replayCheckpointCandidates: 4 });
  assert.deepEqual(result.checkpoints.boundaryOverlapByStatus, { pending: 1, running: 0, completed: 1 });
  assert.equal(result.checkpoints.endingExactlyAtCutoff, 1);
  assert.equal(result.checkpoints.startingExactlyAtCutoff, 1);
});

test("automatic precheck is one read with bounded checkpoint and observation existence probes", async () => {
  let query = "";
  const client = { $queryRaw: async (sql: { strings?: readonly string[] }) => {
    query = sql.strings?.join("?") ?? "";
    return [{ cursorFloorCandidates: 1n, replayCheckpointCandidates: 2n, hasFullyObsoleteCheckpoints: true, hasExecutableObservationWork: false }];
  } } as unknown as PrismaClient;
  const repository = new PrismaPositionHistoryRetentionRepository({ getClient: () => client } as DatabaseService);
  assert.deepEqual(await repository.inspectPrecheck(new Date("2026-05-13T02:00:00Z")), { cursorFloorCandidates: 1, replayCheckpointCandidates: 2, hasFullyObsoleteCheckpoints: true, hasExecutableObservationWork: false });
  assert.equal((query.match(/EXISTS/g) ?? []).length >= 2, true);
  assert.match(query, /vehicle_position_observations[\s\S]*observed_at </);
  assert.match(query, /NOT EXISTS[\s\S]*surviving\.vehicle_id = observation\.vehicle_id/);
  assert.doesNotMatch(query, /COUNT\(DISTINCT|COUNT\(\*\)\s+FROM vehicle_position_observations/);
  assert.doesNotMatch(query, /\b(?:INSERT|UPDATE|DELETE)\b/i);
});

test("policy reconciliation atomically advances cursor floors and policy-retires replay prefixes", async () => {
  let query = "";
  let transactions = 0;
  const transaction = { $queryRaw: async (sql: { strings?: readonly string[] }) => {
    query = sql.strings?.join("?") ?? "";
    return [{ advancedCursorFloors: 2n, advancedReplayCheckpoints: 3n, completedReplayCheckpoints: 1n }];
  } };
  const client = { $transaction: async (work: (value: typeof transaction) => Promise<unknown>) => { transactions += 1; return work(transaction); } } as unknown as PrismaClient;
  const repository = new PrismaPositionHistoryRetentionRepository({ getClient: () => client } as DatabaseService);
  assert.deepEqual(await repository.reconcilePolicyFloor(new Date("2026-05-13T02:00:00Z")), { advancedCursorFloors: 2, advancedReplayCheckpoints: 3, completedReplayCheckpoints: 1 });
  assert.equal(transactions, 1);
  assert.match(query, /UPDATE vehicle_history_ingestion_cursors/);
  assert.match(query, /coverage_from =/);
  assert.match(query, /confirmed_through = GREATEST/);
  assert.match(query, /UPDATE position_history_replay_checkpoints/);
  assert.match(query, /LEAST\(GREATEST\(next_from/);
  assert.match(query, /status <> 'COMPLETED'/);
});

test("execution queries are deterministic set-based short transactions with same-vehicle inclusive surviving coverage", () => {
  const source = readFileSync("src/modules/position-history-retention/prisma-position-history-retention.repository.ts", "utf8");
  assert.match(source, /\$transaction\(async/);
  assert.match(source, /WHERE range_to < \$\{policyCutoff\}/);
  assert.match(source, /ORDER BY range_to ASC, range_from ASC, vehicle_id ASC, id ASC/);
  assert.match(source, /ORDER BY observation\.observed_at ASC, observation\.id ASC/);
  assert.match(source, /LIMIT \$\{limit\}/);
  assert.match(source, /FOR UPDATE(?: OF observation)? SKIP LOCKED/);
  assert.match(source, /surviving\.vehicle_id = observation\.vehicle_id/);
  assert.match(source, /surviving\.range_to >= \$\{policyCutoff\}/);
  assert.match(source, /surviving\.range_from <= observation\.observed_at/);
  assert.match(source, /surviving\.range_to >= observation\.observed_at/);
  assert.equal((source.match(/surviving\.range_from <= observation\.observed_at/g) ?? []).length >= 3, true);
  assert.doesNotMatch(source, /for \(const .*vehicle|deleteMany|findMany/);
});

test("active durable guard covers PENDING/RUNNING for every initiator and never mutates a run", async () => {
  let argument: unknown;
  const client = { positionHistoryPopulationRun: { count: async (value: unknown) => { argument = value; return 4; } } } as unknown as PrismaClient;
  const repository = new PrismaPositionHistoryRetentionRepository({ getClient: () => client } as DatabaseService);
  assert.equal(await repository.countActiveDurableRuns(), 4);
  assert.deepEqual(argument, { where: { status: { in: ["PENDING", "RUNNING"] } } });
  const source = readFileSync("src/modules/position-history-retention/prisma-position-history-retention.repository.ts", "utf8");
  assert.doesNotMatch(source, /positionHistoryPopulationRun\.(?:update|updateMany|delete|deleteMany|create)/);
});
