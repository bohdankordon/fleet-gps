import assert from "node:assert/strict";
import test from "node:test";
import type { PositionHistoryFleetBackfillService } from "../position-history-backfill/position-history-fleet-backfill.service";
import type { PositionHistoryFleetBackfillResult, PositionHistoryFleetBackfillRunOptions, PositionHistoryFleetBackfillTarget } from "../position-history-backfill/position-history-backfill.types";
import { partitionPositionHistoryHorizon } from "../position-history-horizon/position-history-horizon-partition";
import { POSITION_HISTORY_HORIZON_POLICY } from "../position-history-horizon/position-history-horizon.policy";
import { PositionHistoryHorizonPopulationError } from "./position-history-horizon-population.error";
import { PositionHistoryHorizonPopulationService } from "./position-history-horizon-population.service";

const to = new Date("2026-08-11T02:00:00.000Z");

function fleetResult(overrides: Partial<PositionHistoryFleetBackfillResult> = {}): PositionHistoryFleetBackfillResult {
  return { plan: false, vehiclesTotal: 1, providerDisabledExcluded: 0, vehiclesConsidered: 1, vehiclesStarted: 1, vehiclesCompleted: 1, vehiclesAlreadyCompleted: 0, vehiclesRemaining: 0, pendingVehicles: 1, partialVehicles: 0, unmappedVehicles: 0, estimatedRemainingWindows: 168, windowsRequested: 1, providerRequests: 1, providerRows: 2, candidates: 2, inserted: 1, duplicates: 1, invalid: 0, retries: 0, rateLimitResponses: 0, stoppedByBudget: false, ...overrides };
}

function service(run: (target: PositionHistoryFleetBackfillTarget, options: PositionHistoryFleetBackfillRunOptions) => Promise<PositionHistoryFleetBackfillResult>): PositionHistoryHorizonPopulationService {
  return new PositionHistoryHorizonPopulationService({ run } as PositionHistoryFleetBackfillService);
}

test("uses current 90-day policy and executes arbitrary partition output newest to oldest without changing planner order", async () => {
  const chronological = partitionPositionHistoryHorizon(to, POSITION_HISTORY_HORIZON_POLICY.days);
  const targets: PositionHistoryFleetBackfillTarget[] = [];
  const result = await service(async (target) => { targets.push(target); return fleetResult({ vehiclesStarted: 0, vehiclesCompleted: 0, vehiclesAlreadyCompleted: 1, windowsRequested: 0, providerRequests: 0, providerRows: 0, candidates: 0, inserted: 0, duplicates: 0 }); }).run(to, { maxWindows: 1 });
  assert.equal(POSITION_HISTORY_HORIZON_POLICY.days, 90);
  assert.equal(result.slicesTotal, 13);
  assert.equal(result.horizonComplete, true);
  assert.equal(result.slicesAlreadyComplete, 13);
  assert.deepEqual(targets.map((target) => target.from), [...chronological].reverse().map((slice) => slice.from));
  assert.deepEqual(chronological.map((slice) => slice.index), [...Array(13).keys()]);
});

test("enforces one global 200-window budget and passes only 32 to the second slice", async () => {
  const calls: Array<{ target: PositionHistoryFleetBackfillTarget; options: PositionHistoryFleetBackfillRunOptions }> = [];
  const executor = service(async (target, options) => {
    calls.push({ target, options });
    if (calls.length === 1) return fleetResult({ windowsRequested: 168, providerRequests: 168, vehiclesCompleted: 1 });
    return fleetResult({ windowsRequested: 32, providerRequests: 32, vehiclesCompleted: 0, vehiclesRemaining: 1, stoppedByBudget: true });
  });
  const result = await executor.run(to, { maxWindows: 200 });
  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.options.maxWindows, 200);
  assert.equal(calls[1]?.options.maxWindows, 32);
  assert.equal(calls[1]?.options.paceBeforeFirstWindow, true);
  assert.equal(result.windowsRequested, 200);
  assert.equal(result.providerRequests, 200);
  assert.equal(result.stoppedByBudget, true);
  assert.equal(result.horizonComplete, false);
  assert.equal(result.slicesVisited, 2);
});

test("budget exhaustion after a delegated result is a normal result and starts no later slice", async () => {
  let calls = 0;
  const result = await service(async () => { calls += 1; return fleetResult({ windowsRequested: 1, stoppedByBudget: true, vehiclesCompleted: 0, vehiclesRemaining: 1 }); }).run(to, { maxWindows: 1 });
  assert.equal(calls, 1);
  assert.equal(result.stoppedByBudget, true);
  assert.equal(result.horizonComplete, false);
});

test("exact budget completion on the final slice reports horizon success rather than a budget stop", async () => {
  let calls = 0;
  const result = await service(async () => {
    calls += 1;
    if (calls < 13) return fleetResult({ vehiclesStarted: 0, vehiclesCompleted: 0, vehiclesAlreadyCompleted: 1, windowsRequested: 0, providerRequests: 0, providerRows: 0, candidates: 0, inserted: 0, duplicates: 0 });
    return fleetResult({ windowsRequested: 1, providerRequests: 1, vehiclesCompleted: 1 });
  }).run(to, { maxWindows: 1 });
  assert.equal(calls, 13);
  assert.equal(result.windowsRequested, 1);
  assert.equal(result.stoppedByBudget, false);
  assert.equal(result.horizonComplete, true);
});

test("completed exact slice performs zero work and does not consume the global budget", async () => {
  const budgets: number[] = [];
  let calls = 0;
  const result = await service(async (_target, options) => {
    calls += 1;
    budgets.push(options.maxWindows!);
    if (calls === 1) return fleetResult({ vehiclesStarted: 0, vehiclesCompleted: 0, vehiclesAlreadyCompleted: 1, windowsRequested: 0, providerRequests: 0, providerRows: 0, candidates: 0, inserted: 0, duplicates: 0 });
    return fleetResult({ windowsRequested: 2, stoppedByBudget: true, vehiclesCompleted: 0, vehiclesRemaining: 1 });
  }).run(to, { maxWindows: 2 });
  assert.deepEqual(budgets, [2, 2]);
  assert.equal(result.slicesAlreadyComplete, 1);
  assert.equal(result.windowsRequested, 2);
});

test("provider-disabled option is absent by default and forwards exact Stage 13B opt-in without checkpoint mutation logic", async () => {
  const options: PositionHistoryFleetBackfillRunOptions[] = [];
  const executor = service(async (_target, value) => { options.push(value); return fleetResult({ stoppedByBudget: true, providerDisabledExcluded: value.excludeProviderDisabled ? 1 : 0 }); });
  await executor.run(to, { maxWindows: 1 });
  await executor.run(to, { maxWindows: 1, excludeProviderDisabled: true });
  assert.equal(options[0]?.excludeProviderDisabled, undefined);
  assert.equal(options[1]?.excludeProviderDisabled, true);
  assert.equal(Object.hasOwn(options[1]!, "maxVehicles"), false);
});

test("eligible failure stops all later slices and preserves only known prior-slice counters", async () => {
  let calls = 0;
  const failure = Object.assign(new Error("provider secret"), { name: "EquGpsTimeoutError" });
  const executor = service(async () => {
    calls += 1;
    if (calls === 1) return fleetResult({ windowsRequested: 3, providerRequests: 4, providerRows: 8, inserted: 7, duplicates: 1 });
    throw failure;
  });
  await assert.rejects(executor.run(to, { maxWindows: 10 }), (error: unknown) => {
    assert.ok(error instanceof PositionHistoryHorizonPopulationError);
    assert.equal(error.underlyingError, failure);
    assert.equal(error.progress.slicesVisited, 1);
    assert.equal(error.progress.windowsRequested, 3);
    assert.equal(error.progress.providerRequests, 4);
    assert.equal(error.progress.inserted, 7);
    assert.notEqual(error.progress.currentSliceFrom, null);
    return true;
  });
  assert.equal(calls, 2);
});

test("rejects invalid target and unlimited/invalid budgets before delegation", async () => {
  let calls = 0;
  const executor = service(async () => { calls += 1; return fleetResult(); });
  await assert.rejects(executor.run(new Date("invalid"), { maxWindows: 1 }));
  await assert.rejects(executor.run(to, { maxWindows: 0 }));
  await assert.rejects(executor.run(to, { maxWindows: 1.5 }));
  assert.equal(calls, 0);
});

test("future 365-day partition remains iterable without slice-count-specific executor assumptions", () => {
  const slices = partitionPositionHistoryHorizon(to, 365);
  assert.equal(slices.length, 53);
  assert.equal([...slices].reverse().length, 53);
});
