import assert from "node:assert/strict";
import test from "node:test";
import { PositionHistoryReplayKind, PositionHistoryReplayRunStatus, type PositionHistoryReplayRun, type PrismaClient } from "../../generated/prisma/client";
import { DatabaseService } from "../database/database.service";
import { PositionHistoryReplayGenerationConflictError, PositionHistoryReplayInputError } from "./position-history-replay-generation.errors";
import { PrismaPositionHistoryReplayRepository } from "./prisma-position-history-replay.repository";

const anchor = new Date("2026-09-13T00:00:00Z");
const rangeFrom = new Date("2026-09-06T00:00:00Z");
const rangeTo = new Date("2026-09-13T00:00:00Z");

function harness() {
  const values = new Map<string, PositionHistoryReplayRun>();
  let sequence = 0;
  const key = (kind: PositionHistoryReplayKind, generationAnchor: Date) => `${kind}:${generationAnchor.toISOString()}`;
  const delegate = {
    upsert: async ({ where, create }: any) => {
      const identity = key(where.kind_generationAnchor.kind, where.kind_generationAnchor.generationAnchor);
      const existing = values.get(identity);
      if (existing !== undefined) return existing;
      sequence += 1;
      const created: PositionHistoryReplayRun = {
        id: `123e4567-e89b-42d3-a456-${String(sequence).padStart(12, "0")}`,
        kind: create.kind,
        generationAnchor: create.generationAnchor,
        rangeFrom: create.rangeFrom,
        rangeTo: create.rangeTo,
        status: PositionHistoryReplayRunStatus.PENDING,
        createdAt: anchor,
        updatedAt: anchor,
        startedAt: null,
        completedAt: null,
        leaseOwner: null,
        leaseExpiresAt: null,
      };
      values.set(identity, created);
      return created;
    },
    findUnique: async ({ where }: any) => values.get(key(where.kind_generationAnchor.kind, where.kind_generationAnchor.generationAnchor)) ?? null,
  };
  const client = { positionHistoryReplayRun: delegate } as unknown as PrismaClient;
  return { repository: new PrismaPositionHistoryReplayRepository({ getClient: () => client } as DatabaseService), values };
}

test("ensureRun is idempotent per kind/anchor and different kinds remain independent", async () => {
  const item = harness();
  const daily = { kind: PositionHistoryReplayKind.DAILY_7_DAY, generationAnchor: anchor, rangeFrom, rangeTo };
  const first = await item.repository.ensureRun(daily);
  assert.equal((await item.repository.ensureRun(daily)).id, first.id);
  const rolling = await item.repository.ensureRun({ ...daily, kind: PositionHistoryReplayKind.ROLLING_90_DAY });
  assert.notEqual(rolling.id, first.id);
  assert.equal(item.values.size, 2);
});

test("same kind/anchor cannot be silently reinterpreted with different target boundaries", async () => {
  const item = harness();
  const input = { kind: PositionHistoryReplayKind.DAILY_7_DAY, generationAnchor: anchor, rangeFrom, rangeTo };
  await item.repository.ensureRun(input);
  await assert.rejects(item.repository.ensureRun({ ...input, rangeFrom: new Date(rangeFrom.getTime() + 1) }), PositionHistoryReplayGenerationConflictError);
});

test("public repository inputs reject malformed identities, dates, ranges, and unbounded list limits", async () => {
  const item = harness();
  await assert.rejects(item.repository.ensureRun({ kind: PositionHistoryReplayKind.DAILY_7_DAY, generationAnchor: new Date(Number.NaN), rangeFrom, rangeTo }), PositionHistoryReplayInputError);
  await assert.rejects(item.repository.ensureRun({ kind: PositionHistoryReplayKind.DAILY_7_DAY, generationAnchor: anchor, rangeFrom: rangeTo, rangeTo }), PositionHistoryReplayInputError);
  assert.throws(() => item.repository.findRun(PositionHistoryReplayKind.DAILY_7_DAY, new Date(Number.NaN)), PositionHistoryReplayInputError);
  assert.throws(() => item.repository.listIncompleteCheckpoints("not-a-uuid", 1), PositionHistoryReplayInputError);
  assert.throws(() => item.repository.listIncompleteCheckpoints("123e4567-e89b-42d3-a456-426614174000", 10_001), PositionHistoryReplayInputError);
});

test("replay membership discovery is deterministic and excludes provider-disabled mapped vehicles", async () => {
  const calls: unknown[] = [];
  const client = {
    vehicle: {
      findMany: async (input: unknown) => { calls.push(input); return [
        { id: "123e4567-e89b-42d3-a456-426614174001", externalDeviceId: 11, disabled: false },
      ]; },
    },
  } as unknown as PrismaClient;
  const repository = new PrismaPositionHistoryReplayRepository({ getClient: () => client } as DatabaseService);
  assert.deepEqual(await repository.listEligibleVehicles(), [{ vehicleId: "123e4567-e89b-42d3-a456-426614174001", externalDeviceId: 11, disabled: false }]);
  assert.deepEqual(calls, [{ where: { disabled: false }, orderBy: { id: "asc" }, select: { id: true, externalDeviceId: true, disabled: true } }]);
});

test("policy retirement uses the same lease and checkpoint CAS fences without observation persistence", async () => {
  let query = "";
  const client = { $queryRaw: async (sql: { strings?: readonly string[] }) => {
    query = sql.strings?.join("?") ?? "";
    return [{ status: "RUNNING" }];
  } } as unknown as PrismaClient;
  const repository = new PrismaPositionHistoryReplayRepository({ getClient: () => client } as DatabaseService);
  const status = await repository.retireReplayCheckpointPrefix({
    runId: "123e4567-e89b-42d3-a456-426614174000",
    leaseOwner: "123e4567-e89b-42d3-a456-426614174001",
    checkpointId: "123e4567-e89b-42d3-a456-426614174002",
    vehicleId: "123e4567-e89b-42d3-a456-426614174003",
    expectedNextFrom: rangeFrom,
    nextFrom: new Date(rangeFrom.getTime() + 1),
  });
  assert.equal(status, "RUNNING");
  assert.match(query, /UPDATE "position_history_replay_checkpoints"/);
  assert.match(query, /run\."lease_owner"/);
  assert.match(query, /checkpoint\."next_from" =/);
  assert.doesNotMatch(query, /vehicle_position_observations|confirmed_through|coverage_from/);
});
