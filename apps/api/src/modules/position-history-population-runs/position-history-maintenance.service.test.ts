import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { ApiConfig } from "../../config/api-config";
import { PositionHistoryPopulationRunInitiatorType, PositionHistoryPopulationRunStatus } from "../../generated/prisma/client";
import type { DatabaseService } from "../database/database.service";
import type { PositionHistoryHorizonService } from "../position-history-horizon/position-history-horizon.service";
import type { PositionHistoryHorizonPlanResult } from "../position-history-horizon/position-history-horizon.types";
import { POSITION_HISTORY_HORIZON_EXECUTION_LOCK_KEY } from "../position-history-horizon-execution/position-history-horizon-execution-lock.service";
import type { PositionHistoryPopulationRunCreationService } from "./position-history-population-run-creation.service";
import { PositionHistoryPopulationRunConflictError } from "./position-history-population-run.errors";
import { POSITION_HISTORY_POPULATION_RUN_POLL_INTERVAL_MS } from "./position-history-population-run-poller.service";
import { POSITION_HISTORY_MAINTENANCE_CRON, POSITION_HISTORY_MAINTENANCE_TIME_ZONE, POSITION_HISTORY_MAINTENANCE_WINDOW_BUDGET, PositionHistoryMaintenanceService } from "./position-history-maintenance.service";

const now = new Date("2026-08-13T10:00:00.000Z");

function plan(eligibleRemaining = 1, overrides: Partial<PositionHistoryHorizonPlanResult> = {}): PositionHistoryHorizonPlanResult {
  return {
    horizon: { from: new Date("2026-05-13T02:00:00.000Z"), to: new Date("2026-08-11T02:00:00.000Z"), policyDays: 90 },
    targets: { total: 13, fullSevenDay: 12, remainderDurationMs: 6 * 24 * 60 * 60 * 1_000 },
    fleet: { total: 1, providerDisabled: 0, providerEligible: 1 },
    targetVehiclePairs: { total: 13, completed: eligibleRemaining === 0 ? 13 : 12, incomplete: eligibleRemaining === 0 ? 0 : 1, providerEligibleIncomplete: eligibleRemaining === 0 ? 0 : 1 },
    estimatedRemainingHourlyWindows: eligibleRemaining,
    slices: [],
    ...overrides,
  };
}

function subject(options: Readonly<{
  enabled?: boolean;
  active?: object | null;
  plannerResult?: PositionHistoryHorizonPlanResult;
  plannerFailure?: Error;
  creationFailure?: Error;
}> = {}) {
  let activeReads = 0;
  const plannerCalls: Date[] = [];
  const creationCalls: unknown[] = [];
  const database = { getClient: () => ({ positionHistoryPopulationRun: { findFirst: async () => { activeReads += 1; return options.active ?? null; } } }) } as unknown as DatabaseService;
  const horizon = { run: async (anchor: Date) => { plannerCalls.push(anchor); if (options.plannerFailure) throw options.plannerFailure; return options.plannerResult ?? plan(); } } as PositionHistoryHorizonService;
  const creation = { createRun: async (input: unknown) => { creationCalls.push(input); if (options.creationFailure) throw options.creationFailure; return {}; } } as PositionHistoryPopulationRunCreationService;
  const config = { positionHistoryMaintenance: { enabled: options.enabled ?? true } } as ApiConfig;
  return { service: new PositionHistoryMaintenanceService(config, database, horizon, creation), plannerCalls, creationCalls, activeReads: () => activeReads };
}

test("disabled evaluator is a strict no-op before active lookup, planning, creation, worker, or provider concerns", async () => {
  const item = subject({ enabled: false });
  assert.deepEqual(await item.service.evaluate(now), { outcome: "DISABLED", eligibleRemainingWindows: null });
  assert.equal(item.activeReads(), 0);
  assert.deepEqual(item.plannerCalls, []);
  assert.deepEqual(item.creationCalls, []);
  assert.equal("worker" in item.service, false);
  assert.equal("provider" in item.service, false);
});

test("any active USER or SYSTEM PENDING/RUNNING run skips planning and creation without mutation", async () => {
  for (const initiatorType of [PositionHistoryPopulationRunInitiatorType.USER, PositionHistoryPopulationRunInitiatorType.SYSTEM]) {
    for (const status of [PositionHistoryPopulationRunStatus.PENDING, PositionHistoryPopulationRunStatus.RUNNING]) {
      const active = Object.freeze({ id: `${initiatorType}-${status}`, initiatorType, status });
      const item = subject({ active });
      assert.deepEqual(await item.service.evaluate(now), { outcome: "ACTIVE_RUN", eligibleRemainingWindows: null });
      assert.equal(item.activeReads(), 1);
      assert.deepEqual(item.plannerCalls, []);
      assert.deepEqual(item.creationCalls, []);
      assert.deepEqual(active, { id: `${initiatorType}-${status}`, initiatorType, status });
    }
  }
});

test("existing Stage 14 planner receives the canonical anchor and its provider-eligible window truth decides no-work", async () => {
  const disabledOnly = plan(0, {
    fleet: { total: 1, providerDisabled: 1, providerEligible: 0 },
    targetVehiclePairs: { total: 13, completed: 0, incomplete: 13, providerEligibleIncomplete: 0 },
  });
  const item = subject({ plannerResult: disabledOnly });
  assert.deepEqual(await item.service.evaluate(now), { outcome: "NO_ELIGIBLE_WORK", eligibleRemainingWindows: 0 });
  assert.deepEqual(item.plannerCalls.map((value) => value.toISOString()), ["2026-08-11T02:00:00.000Z"]);
  assert.deepEqual(item.creationCalls, []);
});

test("eligible planner truth creates exactly one pending-policy SYSTEM request without user identity or execution", async () => {
  const item = subject({ plannerResult: plan(100) });
  assert.deepEqual(await item.service.evaluate(now), { outcome: "CREATED", eligibleRemainingWindows: 100 });
  assert.equal(item.creationCalls.length, 1);
  assert.deepEqual(item.creationCalls[0], {
    initiatorType: PositionHistoryPopulationRunInitiatorType.SYSTEM,
    to: new Date("2026-08-11T02:00:00.000Z"),
    windowBudget: 5_000,
    excludeProviderDisabled: true,
  });
  assert.equal(JSON.stringify(item.creationCalls[0]).includes("requestedByUserId"), false);
  assert.equal("worker" in item.service, false);
  assert.equal("provider" in item.service, false);
});

test("the existing active-row conflict is a benign multi-instance race loss", async () => {
  const item = subject({ plannerResult: plan(123_084), creationFailure: new PositionHistoryPopulationRunConflictError() });
  assert.deepEqual(await item.service.evaluate(now), { outcome: "CREATION_RACE_LOST", eligibleRemainingWindows: 123_084 });
  assert.equal(item.creationCalls.length, 1);
});

test("unexpected evaluator failures are contained by the scheduled wrapper and no fallback run is guessed", async () => {
  const item = subject({ plannerFailure: new Error("private database/provider-looking detail") });
  await assert.doesNotReject(item.service.scheduledEvaluate());
  assert.equal(item.creationCalls.length, 0);
});

test("terminal history does not suppress current planner truth or reopen old runs", async () => {
  const succeededNoWork = subject({ plannerResult: plan(0) });
  assert.equal((await succeededNoWork.service.evaluate(now)).outcome, "NO_ELIGIBLE_WORK");
  const failedWorkRemains = subject({ plannerResult: plan(50) });
  assert.equal((await failedWorkRemains.service.evaluate(now)).outcome, "CREATED");
  assert.equal(failedWorkRemains.creationCalls.length, 1);
});

test("evaluator anchor rolls only at the Tuesday 02:00 UTC boundary", async () => {
  const before = subject();
  await before.service.evaluate(new Date("2026-08-18T01:59:59.999Z"));
  assert.deepEqual(before.plannerCalls.map((value) => value.toISOString()), ["2026-08-11T02:00:00.000Z"]);
  const atBoundary = subject();
  await atBoundary.service.evaluate(new Date("2026-08-18T02:00:00.000Z"));
  assert.deepEqual(atBoundary.plannerCalls.map((value) => value.toISOString()), ["2026-08-18T02:00:00.000Z"]);
});

test("schedule and execution ownership constants preserve exact Stage 18B/18A architecture", () => {
  assert.equal(POSITION_HISTORY_MAINTENANCE_CRON, "0 0 3 * * *");
  assert.equal(POSITION_HISTORY_MAINTENANCE_TIME_ZONE, "UTC");
  assert.equal(POSITION_HISTORY_MAINTENANCE_WINDOW_BUDGET, 5_000);
  assert.equal(POSITION_HISTORY_POPULATION_RUN_POLL_INTERVAL_MS, 30_000);
  assert.equal(POSITION_HISTORY_HORIZON_EXECUTION_LOCK_KEY, 1706170003);
  const source = readFileSync("src/modules/position-history-population-runs/position-history-maintenance.service.ts", "utf8");
  assert.match(source, /@Cron\(POSITION_HISTORY_MAINTENANCE_CRON,[^\n]*timeZone: POSITION_HISTORY_MAINTENANCE_TIME_ZONE/);
  assert.doesNotMatch(source, /onModuleInit|onApplicationBootstrap|processRun|processNextAvailableRun|PositionHistoryHorizonPopulationService|EquGps|fetch\(/);
  assert.equal((source.match(/@Cron\(/g) ?? []).length, 1);
});
