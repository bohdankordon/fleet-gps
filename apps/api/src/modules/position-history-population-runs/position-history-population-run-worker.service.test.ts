import assert from "node:assert/strict";
import test from "node:test";
import { PositionHistoryPopulationRunInitiatorType, PositionHistoryPopulationRunStatus, type PositionHistoryPopulationRun } from "../../generated/prisma/client";
import { PositionHistoryHorizonAlreadyRunningError, type PositionHistoryHorizonExecutionLockService } from "../position-history-horizon-execution/position-history-horizon-execution-lock.service";
import { PositionHistoryHorizonPopulationError } from "../position-history-horizon-population/position-history-horizon-population.error";
import type { PositionHistoryHorizonPopulationService } from "../position-history-horizon-population/position-history-horizon-population.service";
import type { PositionHistoryPopulationRunStateService } from "./position-history-population-run-state.service";
import { PositionHistoryPopulationRunWorkerService } from "./position-history-population-run-worker.service";

function run(windowBudget: number, committedWindows = 0): PositionHistoryPopulationRun {
  return { id: "123e4567-e89b-42d3-a456-426614174001", status: PositionHistoryPopulationRunStatus.PENDING, initiatorType: PositionHistoryPopulationRunInitiatorType.SYSTEM, requestedByUserId: null, to: new Date("2026-08-13T00:00:00Z"), excludeProviderDisabled: true, windowBudget, committedWindows, createdAt: new Date(), updatedAt: new Date(), startedAt: null, finishedAt: null, leaseOwner: null, leaseExpiresAt: null, safeFailureCode: null };
}

function harness(windowBudget: number, committedWindows = 0, behavior: "advance" | "horizon" | "zero" | "fail" = "advance") {
  let value = run(windowBudget, committedWindows);
  const budgets: number[] = [];
  let claims = 0;
  let starts = 0;
  let stops = 0;
  const state = {
    findEligible: async () => value.status === PositionHistoryPopulationRunStatus.PENDING || value.status === PositionHistoryPopulationRunStatus.RUNNING ? value : null,
    claim: async (_id: string, owner: string) => { claims += 1; value = { ...value, status: PositionHistoryPopulationRunStatus.RUNNING, leaseOwner: owner, leaseExpiresAt: new Date(Date.now() + 120_000), startedAt: value.startedAt ?? new Date() }; return value; },
    getOwned: async (_id: string, owner: string) => value.status === PositionHistoryPopulationRunStatus.RUNNING && value.leaseOwner === owner ? value : null,
    heartbeat: async () => true,
    succeed: async (_id: string, owner: string) => { if (value.leaseOwner !== owner) return false; value = { ...value, status: PositionHistoryPopulationRunStatus.SUCCEEDED, leaseOwner: null, leaseExpiresAt: null, finishedAt: new Date() }; return true; },
    fail: async (_id: string, owner: string, code: string) => { if (value.leaseOwner !== owner) return false; value = { ...value, status: PositionHistoryPopulationRunStatus.FAILED, leaseOwner: null, leaseExpiresAt: null, finishedAt: new Date(), safeFailureCode: code }; return true; },
  } as unknown as PositionHistoryPopulationRunStateService;
  const lock = { runExclusive: async <T>(work: () => Promise<T>) => work() } as PositionHistoryHorizonExecutionLockService;
  const population = { run: async (_to: Date, options: { maxWindows: number; durableAccounting?: { runId: string; leaseOwner: string } }) => {
    budgets.push(options.maxWindows);
    assert.equal(options.durableAccounting?.runId, value.id);
    assert.equal(options.durableAccounting?.leaseOwner, value.leaseOwner);
    if (behavior === "fail") throw new PositionHistoryHorizonPopulationError({} as never, new Error("raw provider body token=secret coordinates"));
    if (behavior === "advance") value = { ...value, committedWindows: value.committedWindows + options.maxWindows };
    if (behavior === "horizon") value = { ...value, committedWindows: value.committedWindows + Math.min(2, options.maxWindows) };
    return { horizonComplete: behavior === "horizon" };
  } } as unknown as PositionHistoryHorizonPopulationService;
  const scheduler = { start: () => { starts += 1; return () => { stops += 1; }; } };
  return { worker: new PositionHistoryPopulationRunWorkerService(state, lock, population, scheduler), budgets, get: () => value, claims: () => claims, timers: () => ({ starts, stops }) };
}

test("durable budgets use internal chunks no larger than 24 and persisted truth chooses every remainder", async () => {
  for (const [budget, expected] of [[6, [6]], [24, [24]], [25, [24, 1]], [50, [24, 24, 2]]] as const) {
    const item = harness(budget);
    const result = await item.worker.processNextAvailableRun();
    assert.equal(result.outcome, "SUCCEEDED");
    assert.deepEqual(item.budgets, expected);
    assert.equal(item.get().committedWindows, budget);
    assert.equal(item.get().leaseOwner, null);
    assert.equal(item.get().leaseExpiresAt, null);
    assert.deepEqual(item.timers(), { starts: 1, stops: 1 });
  }
});

test("crash recovery starts from persisted 24 of 50 and requests only 24 plus 2, never 51", async () => {
  const item = harness(50, 24);
  await item.worker.processNextAvailableRun();
  assert.deepEqual(item.budgets, [24, 2]);
  assert.equal(item.get().committedWindows, 50);
});

test("normal zero-progress chunk succeeds once without spinning", async () => {
  const item = harness(500, 0, "zero");
  const result = await item.worker.processNextAvailableRun();
  assert.equal(result.outcome, "SUCCEEDED");
  assert.deepEqual(item.budgets, [24]);
  assert.equal(item.get().committedWindows, 0);
});

test("horizon completion succeeds below the durable budget", async () => {
  const item = harness(500, 0, "horizon");
  const result = await item.worker.processNextAvailableRun();
  assert.equal(result.outcome, "SUCCEEDED");
  assert.deepEqual(item.budgets, [24]);
  assert.equal(item.get().committedWindows, 2);
});

test("caught failure stores only a stable code, preserves committed work, and does no job retry", async () => {
  const item = harness(50, 24, "fail");
  const result = await item.worker.processNextAvailableRun();
  assert.equal(result.outcome, "FAILED");
  assert.equal(item.get().committedWindows, 24);
  assert.equal(item.get().safeFailureCode, "HISTORY_POPULATION_EXECUTION_FAILED");
  assert.doesNotMatch(JSON.stringify(item.get()), /provider body|token=secret|coordinates/);
  assert.deepEqual(item.budgets, [24]);
});

test("global lock conflict happens before claim and leaves the run retryable", async () => {
  const item = harness(50);
  (item.worker as any).lock = { runExclusive: async () => { throw new PositionHistoryHorizonAlreadyRunningError(); } };
  const result = await item.worker.processNextAvailableRun();
  assert.equal(result.outcome, "LOCK_UNAVAILABLE");
  assert.equal(item.claims(), 0);
  assert.equal(item.get().status, PositionHistoryPopulationRunStatus.PENDING);
});
