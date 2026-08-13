import assert from "node:assert/strict";
import test from "node:test";
import { PositionHistoryPopulationRunInitiatorType, PositionHistoryPopulationRunStatus, Prisma, type PositionHistoryPopulationRun, type PrismaClient } from "../../generated/prisma/client";
import { DatabaseService } from "../database/database.service";
import { PositionHistoryPopulationRunCreationService } from "./position-history-population-run-creation.service";
import { PositionHistoryPopulationRunConflictError, PositionHistoryPopulationRunInputError } from "./position-history-population-run.errors";

const userId = "123e4567-e89b-42d3-a456-426614174000";
const userLogin = "operator";
const runId = "123e4567-e89b-42d3-a456-426614174999";
const to = new Date("2026-08-13T07:08:09.123Z");

function service(auditOverride?: { append(client: unknown, event: unknown): Promise<unknown> }, conflict = false) {
  const calls: unknown[] = [];
  const auditEvents: unknown[] = [];
  const audit = auditOverride ?? { append: async (_client: unknown, event: unknown) => { auditEvents.push(event); return { id: "audit" }; } };
  const transactionCreate = async (input: { data: Record<string, unknown> }) => {
    calls.push(input);
    const now = new Date("2026-08-13T10:00:00Z");
    return { id: runId, status: PositionHistoryPopulationRunStatus.PENDING, committedWindows: 0, createdAt: now, updatedAt: now, startedAt: null, finishedAt: null, leaseOwner: null, leaseExpiresAt: null, safeFailureCode: null, requestedByUserId: null, ...input.data } as PositionHistoryPopulationRun;
  };
  let runCreated = false;
  const statefulTransactionCreate = async (input: { data: Record<string, unknown> }) => { if (conflict) throw new Prisma.PrismaClientKnownRequestError("active conflict", { code: "P2002", clientVersion: "7.9.1" }); runCreated = true; return transactionCreate(input); };
  const client = {
    positionHistoryPopulationRun: { create: statefulTransactionCreate },
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => { runCreated = false; try { return await callback({ positionHistoryPopulationRun: { create: statefulTransactionCreate } }); } catch (error) { runCreated = false; throw error; } },
  } as unknown as PrismaClient;
  return { creation: new PositionHistoryPopulationRunCreationService({ getClient: () => client } as DatabaseService, audit as never), calls, auditEvents, runCreated: () => runCreated };
}

test("creates exact PENDING USER metadata without a provider call or execution state", async () => {
  const item = service();
  const run = await item.creation.createRun({ initiatorType: PositionHistoryPopulationRunInitiatorType.USER, requestedByUserId: userId, requestedByLoginSnapshot: userLogin, to, excludeProviderDisabled: true, windowBudget: 500 });
  assert.equal(run.status, PositionHistoryPopulationRunStatus.PENDING);
  assert.equal(run.committedWindows, 0);
  assert.equal(run.requestedByUserId, userId);
  assert.equal(run.to.toISOString(), to.toISOString());
  assert.equal(run.excludeProviderDisabled, true);
  assert.equal(run.startedAt, null);
  assert.equal(run.leaseOwner, null);
  assert.equal(item.calls.length, 1);
  assert.equal(item.auditEvents.length, 1);
});

test("USER creation commits run and factual DURABLE_POPULATION_CREATED audit atomically with the run UUID", async () => {
  const item = service();
  const run = await item.creation.createRun({ initiatorType: PositionHistoryPopulationRunInitiatorType.USER, requestedByUserId: userId, requestedByLoginSnapshot: userLogin, to, excludeProviderDisabled: false, windowBudget: 1_000 });
  assert.equal(item.auditEvents.length, 1);
  const event = item.auditEvents[0] as { eventType: string; actor: { actorType: string; actorUserId: string; actorLoginSnapshot: string }; targetType: string; targetId: string; details: { to: string; windowBudget: number; excludeProviderDisabled: boolean } };
  assert.equal(event.eventType, "DURABLE_POPULATION_CREATED");
  assert.equal(event.actor.actorType, "USER");
  assert.equal(event.actor.actorUserId, userId);
  assert.equal(event.actor.actorLoginSnapshot, userLogin);
  assert.equal(event.targetType, "POSITION_HISTORY_POPULATION_RUN");
  assert.equal(event.targetId, run.id);
  assert.deepEqual(event.details, { to: to.toISOString(), windowBudget: 1_000, excludeProviderDisabled: false });
  assert.equal(item.runCreated(), true);
});

test("audit failure rolls back the USER durable run and creates zero audit", async () => {
  const item = service({ append: async () => { throw new Error("audit failure"); } });
  await assert.rejects(item.creation.createRun({ initiatorType: PositionHistoryPopulationRunInitiatorType.USER, requestedByUserId: userId, requestedByLoginSnapshot: userLogin, to, excludeProviderDisabled: false, windowBudget: 500 }), /audit failure/);
  assert.equal(item.runCreated(), false);
  assert.equal(item.auditEvents.length, 0);
});

test("SYSTEM creation commits run and exact SYSTEM_POPULATION_CREATED audit together", async () => {
  const item = service();
  const run = await item.creation.createRun({ initiatorType: PositionHistoryPopulationRunInitiatorType.SYSTEM, to, excludeProviderDisabled: false, windowBudget: 500 });
  assert.deepEqual(item.auditEvents, [{ eventType: "SYSTEM_POPULATION_CREATED", actor: { actorType: "SYSTEM", actorUserId: null, actorLoginSnapshot: null }, targetType: "POSITION_HISTORY_POPULATION_RUN", targetId: run.id, details: { to: to.toISOString(), windowBudget: 500, excludeProviderDisabled: false } }]);
  assert.equal(item.runCreated(), true);
});

test("audit failure rolls back the SYSTEM durable run", async () => {
  const item = service({ append: async () => { throw new Error("audit failure"); } });
  await assert.rejects(item.creation.createRun({ initiatorType: PositionHistoryPopulationRunInitiatorType.SYSTEM, to, excludeProviderDisabled: true, windowBudget: 5_000 }), /audit failure/);
  assert.equal(item.runCreated(), false);
  assert.equal(item.auditEvents.length, 0);
});

test("active-conflict rejection writes zero audit rows", async () => {
  const item = service(undefined, true);
  await assert.rejects(item.creation.createRun({ initiatorType: PositionHistoryPopulationRunInitiatorType.USER, requestedByUserId: userId, requestedByLoginSnapshot: userLogin, to, excludeProviderDisabled: false, windowBudget: 500 }), PositionHistoryPopulationRunConflictError);
  assert.equal(item.auditEvents.length, 0);
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
    { initiatorType: PositionHistoryPopulationRunInitiatorType.USER, requestedByUserId: userId, requestedByLoginSnapshot: userLogin, to, excludeProviderDisabled: false, windowBudget: 0 },
    { initiatorType: PositionHistoryPopulationRunInitiatorType.USER, requestedByUserId: userId, to, excludeProviderDisabled: false, windowBudget: 1 },
    { initiatorType: PositionHistoryPopulationRunInitiatorType.USER, requestedByLoginSnapshot: userLogin, to, excludeProviderDisabled: false, windowBudget: 1 },
    { initiatorType: PositionHistoryPopulationRunInitiatorType.SYSTEM, requestedByUserId: userId, to, excludeProviderDisabled: false, windowBudget: 1 },
    { initiatorType: PositionHistoryPopulationRunInitiatorType.SYSTEM, to, excludeProviderDisabled: false, windowBudget: 0 },
    { initiatorType: PositionHistoryPopulationRunInitiatorType.SYSTEM, to, excludeProviderDisabled: false, windowBudget: 2_147_483_648 },
    { initiatorType: PositionHistoryPopulationRunInitiatorType.SYSTEM, to, excludeProviderDisabled: false, windowBudget: Number.MAX_SAFE_INTEGER + 1 },
    { initiatorType: PositionHistoryPopulationRunInitiatorType.SYSTEM, to: "now", excludeProviderDisabled: false, windowBudget: 1 },
  ]) await assert.rejects(item.creation.createRun(input as never), PositionHistoryPopulationRunInputError);
  assert.equal(item.calls.length, 0);
});
