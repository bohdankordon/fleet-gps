import assert from "node:assert/strict";
import test from "node:test";
import type { AuditUserActor } from "../audit";
import type { PositionHistoryHorizonPopulationService } from "../position-history-horizon-population/position-history-horizon-population.service";
import type { PositionHistoryHorizonPopulationResult } from "../position-history-horizon-population/position-history-horizon-population.types";
import type { PositionHistoryHorizonExecutionLockService } from "./position-history-horizon-execution-lock.service";
import { PositionHistoryHorizonExecutionRunnerService } from "./position-history-horizon-execution-runner.service";
import { PositionHistoryHorizonExecutionFinalizationError, PositionHistoryHorizonExecutionService } from "./position-history-horizon-execution.service";
import type { PositionHistoryHorizonExecutionRequest } from "./position-history-horizon-execution.types";

const request: PositionHistoryHorizonExecutionRequest = { requestedTo: "2026-08-11T05:00:00.000+03:00", to: new Date("2026-08-11T02:00:00.000Z"), maxWindows: 12, excludeProviderDisabled: false };
const actor: AuditUserActor = { actorType: "USER", actorUserId: "00000000-0000-4000-8000-000000000001", actorLoginSnapshot: "operator" };
const populationResult: PositionHistoryHorizonPopulationResult = { horizonFrom: new Date("2026-05-13T02:00:00Z"), horizonTo: request.to, policyDays: 90, slicesTotal: 13, slicesVisited: 1, slicesAlreadyComplete: 0, providerDisabledExcluded: 0, windowsRequested: 12, providerRequests: 13, providerRows: 20, candidates: 18, inserted: 15, duplicates: 3, invalid: 2, retries: 1, rateLimitResponses: 1, stoppedByBudget: true, horizonComplete: false, currentSliceFrom: new Date("2026-08-04T02:00:00Z"), currentSliceTo: request.to };

function fixture(result: PositionHistoryHorizonPopulationResult = populationResult, auditFailure = false) {
  let locks = 0;
  let executions = 0;
  let auditAttempts = 0;
  const auditEvents: unknown[] = [];
  const population = { run: async () => { executions += 1; return result; } } as unknown as PositionHistoryHorizonPopulationService;
  const lock = { runExclusive: async <T>(work: () => Promise<T>) => { locks += 1; return work(); } } as PositionHistoryHorizonExecutionLockService;
  const audit = { appendWithDatabase: async (event: unknown) => { auditAttempts += 1; if (auditFailure) throw new Error("audit failure"); auditEvents.push(event); return { id: "audit" }; } };
  return { service: new PositionHistoryHorizonExecutionService(new PositionHistoryHorizonExecutionRunnerService(population, lock), audit as never), auditEvents, locks: () => locks, executions: () => executions, auditAttempts: () => auditAttempts };
}

test("successful factual short population writes one USER audit only after committed work", async () => {
  const state = fixture();
  const result = await state.service.run(request, actor);
  assert.equal(state.locks(), 1);
  assert.equal(state.executions(), 1);
  assert.deepEqual(result, { to: request.requestedTo, maxWindows: 12, excludeProviderDisabled: false, committedWindows: 12, providerRequests: 13, rowsReceived: 20, candidates: 18, inserted: 15, duplicates: 3, invalid: 2, retries: 1, rateLimits: 1, slicesTotal: 13, slicesVisited: 1, slicesAlreadyComplete: 0, providerDisabledExcluded: 0, stoppedByBudget: true, horizonComplete: false });
  assert.deepEqual(state.auditEvents, [{ eventType: "SHORT_POPULATION_EXECUTED", actor, targetType: "POSITION_HISTORY", targetId: null, details: { to: request.requestedTo, windowBudget: 12, excludeProviderDisabled: false, committedWindows: 12 } }]);
});

test("zero committed windows creates no audit", async () => {
  const state = fixture({ ...populationResult, windowsRequested: 0 });
  assert.equal((await state.service.run(request, actor)).committedWindows, 0);
  assert.equal(state.auditEvents.length, 0);
  assert.equal(state.auditAttempts(), 0);
});

test("runner failure retains its original error and fabricates no audit event", async () => {
  const executionFailure = new Error("executor failed");
  const population = { run: async () => { throw executionFailure; } } as unknown as PositionHistoryHorizonPopulationService;
  const runner = new PositionHistoryHorizonExecutionRunnerService(population, { runExclusive: async <T>(work: () => Promise<T>) => work() } as PositionHistoryHorizonExecutionLockService);
  const events: unknown[] = [];
  const failedExecution = new PositionHistoryHorizonExecutionService(runner, { appendWithDatabase: async (event: unknown) => { events.push(event); } } as never);
  await assert.rejects(failedExecution.run(request, actor), executionFailure);
  assert.equal(events.length, 0);
});

test("final audit failure becomes a safe finalization error without compensating or retrying completed work", async () => {
  const auditFailure = fixture(populationResult, true);
  await assert.rejects(auditFailure.service.run(request, actor), (error) => error instanceof PositionHistoryHorizonExecutionFinalizationError && !error.message.includes("audit failure"));
  assert.equal(auditFailure.executions(), 1);
  assert.equal(auditFailure.auditAttempts(), 1);
  assert.equal(auditFailure.auditEvents.length, 0);
});

test("safe execution response and audit omit executor/provider/GPS internals", async () => {
  const state = fixture();
  const safe = JSON.stringify({ response: await state.service.run(request, actor), audit: state.auditEvents });
  for (const forbidden of ["providerUrl", "token", "externalDeviceId", "latitude", "longitude", "fingerprint", "nextFrom", "currentSlice", "taxi_session"]) assert.equal(safe.includes(forbidden), false);
});
