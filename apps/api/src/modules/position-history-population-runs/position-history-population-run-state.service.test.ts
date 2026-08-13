import assert from "node:assert/strict";
import test from "node:test";
import { PositionHistoryPopulationRunInitiatorType, PositionHistoryPopulationRunStatus, type PositionHistoryPopulationRun, type PrismaClient } from "../../generated/prisma/client";
import { DatabaseService } from "../database/database.service";
import { POSITION_HISTORY_POPULATION_RUN_LEASE_DURATION_MS } from "./position-history-population-run.constants";
import { PositionHistoryPopulationRunStateService } from "./position-history-population-run-state.service";

const baseTime = new Date("2026-08-13T10:00:00Z");
const run = (overrides: Partial<PositionHistoryPopulationRun> = {}): PositionHistoryPopulationRun => ({
  id: "123e4567-e89b-42d3-a456-426614174001", status: PositionHistoryPopulationRunStatus.PENDING, initiatorType: PositionHistoryPopulationRunInitiatorType.SYSTEM,
  requestedByUserId: null, to: new Date("2026-08-13T00:00:00Z"), excludeProviderDisabled: false, windowBudget: 50, committedWindows: 0,
  createdAt: new Date("2026-08-13T09:00:00Z"), updatedAt: baseTime, startedAt: null, finishedAt: null, leaseOwner: null, leaseExpiresAt: null, safeFailureCode: null, ...overrides,
});

function harness(initial: PositionHistoryPopulationRun) {
  let value = initial;
  let now = new Date(baseTime);
  const matches = (where: Record<string, any>): boolean => {
    if (where.id !== undefined && where.id !== value.id) return false;
    if (where.status !== undefined && where.status !== value.status) return false;
    if (where.leaseOwner !== undefined && where.leaseOwner !== value.leaseOwner) return false;
    if (where.leaseExpiresAt?.lte !== undefined && (value.leaseExpiresAt === null || value.leaseExpiresAt > where.leaseExpiresAt.lte)) return false;
    if (where.OR !== undefined && !where.OR.some((item: Record<string, any>) => matches(item))) return false;
    return true;
  };
  const delegate = {
    findFirst: async ({ where }: { where: Record<string, any> }) => matches(where) ? { ...value } : null,
    findUnique: async ({ where }: { where: Record<string, any> }) => matches(where) ? { ...value } : null,
    updateMany: async ({ where, data }: { where: Record<string, any>; data: Record<string, any> }) => {
      if (!matches(where)) return { count: 0 };
      value = { ...value, ...data, updatedAt: now } as PositionHistoryPopulationRun;
      return { count: 1 };
    },
  };
  const client = { positionHistoryPopulationRun: delegate } as unknown as PrismaClient;
  const state = new PositionHistoryPopulationRunStateService({ getClient: () => client } as DatabaseService, { now: () => new Date(now) });
  return { state, get: () => value, setNow: (next: Date) => { now = next; } };
}

test("PENDING claim sets RUNNING, startedAt once, random owner lease, and heartbeat is owner-conditional", async () => {
  const item = harness(run());
  const owner = "123e4567-e89b-42d3-a456-426614174010";
  const claimed = await item.state.claim(item.get().id, owner);
  assert.equal(claimed?.status, PositionHistoryPopulationRunStatus.RUNNING);
  assert.equal(claimed?.startedAt?.toISOString(), baseTime.toISOString());
  assert.equal(claimed?.leaseOwner, owner);
  assert.equal(claimed?.leaseExpiresAt?.getTime(), baseTime.getTime() + POSITION_HISTORY_POPULATION_RUN_LEASE_DURATION_MS);
  item.setNow(new Date(baseTime.getTime() + 30_000));
  assert.equal(await item.state.heartbeat(item.get().id, "123e4567-e89b-42d3-a456-426614174099"), false);
  assert.equal(await item.state.heartbeat(item.get().id, owner), true);
  assert.equal(item.get().leaseExpiresAt?.getTime(), baseTime.getTime() + 30_000 + POSITION_HISTORY_POPULATION_RUN_LEASE_DURATION_MS);
});

test("unexpired RUNNING is not reclaimed; expired RUNNING preserves progress/start and gets a new owner", async () => {
  const startedAt = new Date("2026-08-13T08:00:00Z");
  const oldOwner = "123e4567-e89b-42d3-a456-426614174011";
  const item = harness(run({ status: PositionHistoryPopulationRunStatus.RUNNING, startedAt, committedWindows: 24, leaseOwner: oldOwner, leaseExpiresAt: new Date(baseTime.getTime() + 1) }));
  assert.equal(await item.state.claim(item.get().id, "123e4567-e89b-42d3-a456-426614174012"), null);
  item.setNow(new Date(baseTime.getTime() + 2));
  const reclaimed = await item.state.claim(item.get().id, "123e4567-e89b-42d3-a456-426614174012");
  assert.equal(reclaimed?.committedWindows, 24);
  assert.equal(reclaimed?.startedAt?.toISOString(), startedAt.toISOString());
  assert.notEqual(reclaimed?.leaseOwner, oldOwner);
});

test("stale owner cannot finalize; matching success/failure clears lease", async () => {
  const owner = "123e4567-e89b-42d3-a456-426614174013";
  const item = harness(run({ status: PositionHistoryPopulationRunStatus.RUNNING, startedAt: baseTime, leaseOwner: owner, leaseExpiresAt: new Date(baseTime.getTime() + 1000) }));
  assert.equal(await item.state.succeed(item.get().id, "123e4567-e89b-42d3-a456-426614174099"), false);
  assert.equal(await item.state.fail(item.get().id, owner, "SAFE_CODE"), true);
  assert.equal(item.get().status, PositionHistoryPopulationRunStatus.FAILED);
  assert.equal(item.get().leaseOwner, null);
  assert.equal(item.get().leaseExpiresAt, null);
  assert.equal(item.get().safeFailureCode, "SAFE_CODE");
});

test("SUCCEEDED and FAILED history are never automatically claimable", async () => {
  for (const status of [PositionHistoryPopulationRunStatus.SUCCEEDED, PositionHistoryPopulationRunStatus.FAILED]) {
    const item = harness(run({ status, finishedAt: baseTime }));
    assert.equal(await item.state.findEligible(), null);
    assert.equal(await item.state.claim(item.get().id, "123e4567-e89b-42d3-a456-426614174014"), null);
  }
});
