import assert from "node:assert/strict";
import test from "node:test";
import { PositionHistoryReplayKind, PositionHistoryReplayRunStatus, type PositionHistoryReplayRun, type PrismaClient } from "../../generated/prisma/client";
import { DatabaseService } from "../database/database.service";
import { PositionHistoryReplayRunStateService } from "./position-history-replay-run-state.service";

const t0 = new Date("2026-09-13T10:00:00Z");
const ownerA = "123e4567-e89b-42d3-a456-426614174001";
const ownerB = "123e4567-e89b-42d3-a456-426614174002";

function base(overrides: Partial<PositionHistoryReplayRun> = {}): PositionHistoryReplayRun {
  return {
    id: "123e4567-e89b-42d3-a456-426614174000",
    kind: PositionHistoryReplayKind.ROLLING_90_DAY,
    generationAnchor: t0,
    rangeFrom: new Date("2026-06-15T10:00:00Z"),
    rangeTo: t0,
    status: PositionHistoryReplayRunStatus.PENDING,
    createdAt: t0,
    updatedAt: t0,
    startedAt: null,
    completedAt: null,
    leaseOwner: null,
    leaseExpiresAt: null,
    ...overrides,
  };
}

function harness(initial = base()) {
  let value = initial;
  let checkpointsComplete = false;
  const matches = (where: Record<string, any>): boolean => {
    if (where.id !== undefined && where.id !== value.id) return false;
    if (where.status !== undefined && where.status !== value.status) return false;
    if (where.leaseOwner !== undefined && where.leaseOwner !== value.leaseOwner) return false;
    if (where.leaseExpiresAt?.gt !== undefined && (value.leaseExpiresAt === null || value.leaseExpiresAt <= where.leaseExpiresAt.gt)) return false;
    if (where.leaseExpiresAt?.lte !== undefined && (value.leaseExpiresAt === null || value.leaseExpiresAt > where.leaseExpiresAt.lte)) return false;
    if (where.OR !== undefined && !where.OR.some((part: Record<string, any>) => matches(part))) return false;
    return true;
  };
  const delegate = {
    findFirst: async ({ where }: any) => matches(where) ? value : null,
    findUnique: async ({ where }: any) => where.id === value.id ? value : null,
    updateMany: async ({ where, data }: any) => {
      if (!matches(where)) return { count: 0 };
      value = { ...value, ...data };
      return { count: 1 };
    },
  };
  const client = {
    positionHistoryReplayRun: delegate,
    $queryRaw: async (query: { values?: unknown[] }) => {
      const requestedOwner = query.values?.[2];
      const requestedNow = query.values?.[3];
      if (!checkpointsComplete || requestedOwner !== value.leaseOwner || !(requestedNow instanceof Date) || value.leaseExpiresAt === null || value.leaseExpiresAt <= requestedNow) return [];
      value = { ...value, status: PositionHistoryReplayRunStatus.COMPLETED, completedAt: t0, leaseOwner: null, leaseExpiresAt: null };
      return [{ id: value.id }];
    },
  } as unknown as PrismaClient;
  return { state: new PositionHistoryReplayRunStateService({ getClient: () => client } as DatabaseService), get: () => value, setComplete: () => { checkpointsComplete = true; } };
}

test("claim, renew, and yield are owner-conditional and preserve resumable startedAt", async () => {
  const item = harness();
  const lease1 = new Date(t0.getTime() + 120_000);
  const claimed = await item.state.claimRun({ runId: item.get().id, leaseOwner: ownerA, now: t0, leaseExpiresAt: lease1 });
  assert.equal(claimed?.status, PositionHistoryReplayRunStatus.RUNNING);
  assert.equal(claimed?.startedAt?.toISOString(), t0.toISOString());
  assert.equal(await item.state.renewLease({ runId: item.get().id, leaseOwner: ownerB, now: t0, leaseExpiresAt: new Date(lease1.getTime() + 1) }), false);
  assert.equal(await item.state.renewLease({ runId: item.get().id, leaseOwner: ownerA, now: t0, leaseExpiresAt: new Date(lease1.getTime() + 1) }), true);
  assert.equal(await item.state.yieldRun({ runId: item.get().id, leaseOwner: ownerB, now: t0 }), false);
  assert.equal(await item.state.yieldRun({ runId: item.get().id, leaseOwner: ownerA, now: t0 }), true);
  assert.equal(item.get().status, PositionHistoryReplayRunStatus.PENDING);
  assert.equal(item.get().startedAt?.toISOString(), t0.toISOString());
  const reclaimed = await item.state.claimRun({ runId: item.get().id, leaseOwner: ownerB, now: new Date(t0.getTime() + 1), leaseExpiresAt: new Date(t0.getTime() + 120_001) });
  assert.equal(reclaimed?.leaseOwner, ownerB);
  assert.equal(reclaimed?.startedAt?.toISOString(), t0.toISOString());
});

test("expired ownership cannot renew, yield, or complete and may be reclaimed", async () => {
  const expired = new Date(t0.getTime() - 1);
  const item = harness(base({ status: PositionHistoryReplayRunStatus.RUNNING, startedAt: new Date(t0.getTime() - 10_000), leaseOwner: ownerA, leaseExpiresAt: expired }));
  assert.equal(await item.state.renewLease({ runId: item.get().id, leaseOwner: ownerA, now: t0, leaseExpiresAt: new Date(t0.getTime() + 1) }), false);
  assert.equal(await item.state.yieldRun({ runId: item.get().id, leaseOwner: ownerA, now: t0 }), false);
  assert.equal(await item.state.completeRun({ runId: item.get().id, leaseOwner: ownerA, now: t0 }), false);
  assert.equal((await item.state.claimRun({ runId: item.get().id, leaseOwner: ownerB, now: t0, leaseExpiresAt: new Date(t0.getTime() + 1) }))?.leaseOwner, ownerB);
});

test("completion is fenced by ownership and complete checkpoint truth", async () => {
  const item = harness(base({ status: PositionHistoryReplayRunStatus.RUNNING, startedAt: t0, leaseOwner: ownerA, leaseExpiresAt: new Date(t0.getTime() + 1_000) }));
  assert.equal(await item.state.completeRun({ runId: item.get().id, leaseOwner: ownerA, now: t0 }), false);
  item.setComplete();
  assert.equal(await item.state.completeRun({ runId: item.get().id, leaseOwner: ownerB, now: t0 }), false);
  assert.equal(await item.state.completeRun({ runId: item.get().id, leaseOwner: ownerA, now: t0 }), true);
  assert.equal(item.get().status, PositionHistoryReplayRunStatus.COMPLETED);
});

test("generation alternatives are ordered, bounded, and include only claimable leases", async () => {
  let query: any;
  const client = { positionHistoryReplayRun: { findMany: async (input: unknown) => { query = input; return [base()]; } } } as unknown as PrismaClient;
  const state = new PositionHistoryReplayRunStateService({ getClient: () => client } as DatabaseService);
  assert.equal((await state.findClaimableCandidates(t0, PositionHistoryReplayKind.ROLLING_90_DAY, 8)).length, 1);
  assert.equal(query.take, 8);
  assert.equal(query.where.kind, PositionHistoryReplayKind.ROLLING_90_DAY);
  assert.deepEqual(query.where.OR, [
    { status: PositionHistoryReplayRunStatus.PENDING },
    { status: PositionHistoryReplayRunStatus.RUNNING, leaseExpiresAt: { lte: t0 } },
  ]);
  assert.deepEqual(query.orderBy[0], { generationAnchor: "asc" });
  assert.throws(() => state.findClaimableCandidates(t0, PositionHistoryReplayKind.ROLLING_90_DAY, 9));
});
