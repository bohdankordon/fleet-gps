import assert from "node:assert/strict";
import test from "node:test";
import type { PositionHistoryHorizonPopulationService } from "../position-history-horizon-population/position-history-horizon-population.service";
import type { PositionHistoryHorizonPopulationResult } from "../position-history-horizon-population/position-history-horizon-population.types";
import type { PositionHistoryHorizonExecutionLockService } from "./position-history-horizon-execution-lock.service";
import { PositionHistoryHorizonExecutionRunnerService } from "./position-history-horizon-execution-runner.service";
import { PositionHistoryHorizonExecutionService } from "./position-history-horizon-execution.service";
import type { PositionHistoryHorizonExecutionRequest } from "./position-history-horizon-execution.types";

const request: PositionHistoryHorizonExecutionRequest = { requestedTo: "2026-08-11T05:00:00.000+03:00", to: new Date("2026-08-11T02:00:00.000Z"), maxWindows: 12, excludeProviderDisabled: false };
const populationResult: PositionHistoryHorizonPopulationResult = { horizonFrom: new Date("2026-05-13T02:00:00Z"), horizonTo: request.to, policyDays: 90, slicesTotal: 13, slicesVisited: 1, slicesAlreadyComplete: 0, providerDisabledExcluded: 0, windowsRequested: 12, providerRequests: 13, providerRows: 20, candidates: 18, inserted: 15, duplicates: 3, invalid: 2, retries: 1, rateLimitResponses: 1, stoppedByBudget: true, horizonComplete: false, currentSliceFrom: new Date("2026-08-04T02:00:00Z"), currentSliceTo: request.to };

test("runs only the accepted Stage 14C executor under the global lock with exact inputs", async () => {
  let locks = 0; const calls: unknown[][] = [];
  const population = { run: async (...args: unknown[]) => { calls.push(args); return populationResult; } } as unknown as PositionHistoryHorizonPopulationService;
  const lock = { runExclusive: async <T>(work: () => Promise<T>) => { locks += 1; return work(); } } as PositionHistoryHorizonExecutionLockService;
  const result = await new PositionHistoryHorizonExecutionService(new PositionHistoryHorizonExecutionRunnerService(population, lock)).run(request);
  assert.equal(locks, 1); assert.equal(calls[0]?.[0], request.to); assert.deepEqual(calls[0]?.[1], { maxWindows: 12, excludeProviderDisabled: false });
  assert.deepEqual(result, { to: request.requestedTo, maxWindows: 12, excludeProviderDisabled: false, committedWindows: 12, providerRequests: 13, rowsReceived: 20, candidates: 18, inserted: 15, duplicates: 3, invalid: 2, retries: 1, rateLimits: 1, slicesTotal: 13, slicesVisited: 1, slicesAlreadyComplete: 0, providerDisabledExcluded: 0, stoppedByBudget: true, horizonComplete: false });
});

test("safe execution result omits executor-only and sensitive fields", async () => {
  const population = { run: async () => populationResult } as unknown as PositionHistoryHorizonPopulationService;
  const lock = { runExclusive: async <T>(work: () => Promise<T>) => work() } as PositionHistoryHorizonExecutionLockService;
  const safe = JSON.stringify(await new PositionHistoryHorizonExecutionService(new PositionHistoryHorizonExecutionRunnerService(population, lock)).run(request));
  for (const forbidden of ["providerUrl", "token", "externalDeviceId", "latitude", "longitude", "fingerprint", "nextFrom", "currentSlice", "taxi_session"]) assert.equal(safe.includes(forbidden), false);
});
