import assert from "node:assert/strict";
import test from "node:test";
import { PositionHistoryPopulationRunInitiatorType, PositionHistoryPopulationRunStatus } from "../../generated/prisma/client";
import type { DatabaseService } from "../database/database.service";
import type { PositionHistoryPopulationRunCreationService } from "./position-history-population-run-creation.service";
import { PositionHistoryPopulationRunAdminService, toSafePositionHistoryPopulationRun } from "./position-history-population-run-admin.service";

const now = new Date("2026-08-13T10:00:00.000Z");
const row = (status: PositionHistoryPopulationRunStatus, failure: string | null = null) => ({ id: "00000000-0000-4000-8000-000000000123", initiatorType: PositionHistoryPopulationRunInitiatorType.USER, requestedByUserId: "00000000-0000-4000-8000-000000000001", to: new Date("2026-08-11T02:00:00Z"), excludeProviderDisabled: true, windowBudget: 1000, committedWindows: 24, status, leaseOwner: "internal-owner", leaseExpiresAt: now, safeFailureCode: failure, startedAt: now, finishedAt: status === PositionHistoryPopulationRunStatus.RUNNING ? null : now, createdAt: now, updatedAt: now });

test("create derives USER initiator and authenticated requestedBy identity", async () => {
  const calls: unknown[] = [];
  const creation = { createRun: async (input: unknown) => { calls.push(input); return row(PositionHistoryPopulationRunStatus.PENDING); } } as unknown as PositionHistoryPopulationRunCreationService;
  const service = new PositionHistoryPopulationRunAdminService({} as DatabaseService, creation);
  const actor = "00000000-0000-4000-8000-000000000001";
  const result = await service.create(actor, { to: new Date("2026-08-11T02:00:00Z"), windowBudget: 500, excludeProviderDisabled: false });
  assert.deepEqual(calls, [{ initiatorType: PositionHistoryPopulationRunInitiatorType.USER, requestedByUserId: actor, to: new Date("2026-08-11T02:00:00Z"), excludeProviderDisabled: false, windowBudget: 500 }]);
  assert.equal(result.initiatorType, "USER");
  assert.equal(JSON.stringify(result).includes("requestedByUserId"), false);
});

test("active and recent queries are bounded/read-only and safe", async () => {
  const seen: Array<{ method: string; args: unknown }> = [];
  const activeRow = row(PositionHistoryPopulationRunStatus.RUNNING);
  const recentRows = [row(PositionHistoryPopulationRunStatus.SUCCEEDED), row(PositionHistoryPopulationRunStatus.FAILED, "HISTORY_POPULATION_EXECUTION_FAILED")];
  const database = { getClient: () => ({ positionHistoryPopulationRun: {
    findFirst: async (args: unknown) => { seen.push({ method: "findFirst", args }); return activeRow; },
    findMany: async (args: unknown) => { seen.push({ method: "findMany", args }); return recentRows; },
  } }) } as unknown as DatabaseService;
  const service = new PositionHistoryPopulationRunAdminService(database, {} as PositionHistoryPopulationRunCreationService);
  const active = await service.active(); const recent = await service.recent();
  assert.equal(active?.status, "RUNNING"); assert.deepEqual(recent.map((value) => value.status), ["SUCCEEDED", "FAILED"]);
  assert.equal(recent[1]?.failureCategory, "EXECUTION");
  const serialized = JSON.stringify([active, recent]);
  for (const forbidden of ["leaseOwner", "leaseExpiresAt", "requestedByUserId", "safeFailureCode", "internal-owner"]) assert.equal(serialized.includes(forbidden), false);
  assert.deepEqual((seen[0]!.args as { where: unknown }).where, { status: { in: [PositionHistoryPopulationRunStatus.PENDING, PositionHistoryPopulationRunStatus.RUNNING] } });
  const recentArgs = seen[1]!.args as { where: unknown; take: number; orderBy: unknown };
  assert.deepEqual(recentArgs.where, { status: { in: [PositionHistoryPopulationRunStatus.SUCCEEDED, PositionHistoryPopulationRunStatus.FAILED] } });
  assert.equal(recentArgs.take, 10); assert.deepEqual(recentArgs.orderBy, [{ createdAt: "desc" }, { id: "desc" }]);
  assert.equal(Object.keys(toSafePositionHistoryPopulationRun(activeRow)).length, 11);
});

test("active returns null and unknown failure codes map to a stable category", async () => {
  const database = { getClient: () => ({ positionHistoryPopulationRun: { findFirst: async () => null } }) } as unknown as DatabaseService;
  assert.equal(await new PositionHistoryPopulationRunAdminService(database, {} as PositionHistoryPopulationRunCreationService).active(), null);
  assert.equal(toSafePositionHistoryPopulationRun(row(PositionHistoryPopulationRunStatus.FAILED, "SENSITIVE_INTERNAL_DETAIL")).failureCategory, "UNKNOWN");
});

