import assert from "node:assert/strict";
import test from "node:test";
import { PositionHistoryPopulationRunInitiatorType, PositionHistoryPopulationRunStatus, type PositionHistoryPopulationRun, type PrismaClient } from "../../generated/prisma/client";
import { DatabaseService } from "../database/database.service";
import { PositionHistoryPopulationRunCreationService } from "./position-history-population-run-creation.service";
import { PositionHistoryPopulationRunInputError } from "./position-history-population-run.errors";

const userId = "123e4567-e89b-42d3-a456-426614174000";
const to = new Date("2026-08-13T07:08:09.123Z");

function service() {
  const calls: unknown[] = [];
  const client = { positionHistoryPopulationRun: { create: async (input: { data: Record<string, unknown> }) => {
    calls.push(input);
    const now = new Date("2026-08-13T10:00:00Z");
    return { id: "run", status: PositionHistoryPopulationRunStatus.PENDING, committedWindows: 0, createdAt: now, updatedAt: now, startedAt: null, finishedAt: null, leaseOwner: null, leaseExpiresAt: null, safeFailureCode: null, requestedByUserId: null, ...input.data } as PositionHistoryPopulationRun;
  } } } as unknown as PrismaClient;
  return { creation: new PositionHistoryPopulationRunCreationService({ getClient: () => client } as DatabaseService), calls };
}

test("creates exact PENDING USER metadata without a provider call or execution state", async () => {
  const item = service();
  const run = await item.creation.createRun({ initiatorType: PositionHistoryPopulationRunInitiatorType.USER, requestedByUserId: userId, to, excludeProviderDisabled: true, windowBudget: 500 });
  assert.equal(run.status, PositionHistoryPopulationRunStatus.PENDING);
  assert.equal(run.committedWindows, 0);
  assert.equal(run.requestedByUserId, userId);
  assert.equal(run.to.toISOString(), to.toISOString());
  assert.equal(run.excludeProviderDisabled, true);
  assert.equal(run.startedAt, null);
  assert.equal(run.leaseOwner, null);
  assert.equal(item.calls.length, 1);
});

test("SYSTEM foundation accepts no user and structurally supports large safe budgets", async () => {
  for (const windowBudget of [500, 1_000, 5_000]) {
    const run = await service().creation.createRun({ initiatorType: PositionHistoryPopulationRunInitiatorType.SYSTEM, to, excludeProviderDisabled: false, windowBudget });
    assert.equal(run.windowBudget, windowBudget);
    assert.equal(run.requestedByUserId, null);
  }
});

test("creation rejects invalid budgets and initiator linkage before persistence", async () => {
  const item = service();
  for (const input of [
    { initiatorType: PositionHistoryPopulationRunInitiatorType.USER, to, excludeProviderDisabled: false, windowBudget: 1 },
    { initiatorType: PositionHistoryPopulationRunInitiatorType.SYSTEM, requestedByUserId: userId, to, excludeProviderDisabled: false, windowBudget: 1 },
    { initiatorType: PositionHistoryPopulationRunInitiatorType.SYSTEM, to, excludeProviderDisabled: false, windowBudget: 0 },
    { initiatorType: PositionHistoryPopulationRunInitiatorType.SYSTEM, to, excludeProviderDisabled: false, windowBudget: 2_147_483_648 },
    { initiatorType: PositionHistoryPopulationRunInitiatorType.SYSTEM, to, excludeProviderDisabled: false, windowBudget: Number.MAX_SAFE_INTEGER + 1 },
    { initiatorType: PositionHistoryPopulationRunInitiatorType.SYSTEM, to: "now", excludeProviderDisabled: false, windowBudget: 1 },
  ]) await assert.rejects(item.creation.createRun(input as never), PositionHistoryPopulationRunInputError);
  assert.equal(item.calls.length, 0);
});
