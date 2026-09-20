import assert from "node:assert/strict";
import test from "node:test";
import { Test } from "@nestjs/testing";
import {
  PositionBackfillStatus,
  PositionHistoryReplayKind,
  PositionHistoryReplayRunStatus,
  PositionHistoryPopulationRunInitiatorType,
  PositionHistoryPopulationRunStatus,
  type PositionHistoryReplayCheckpoint,
  type PositionHistoryReplayRun,
  type PositionHistoryPopulationRun,
} from "../../generated/prisma/client";
import type { ApiConfig } from "../../config/api-config";
import { API_CONFIG } from "../../config/api-config.tokens";
import { DatabaseService } from "../database/database.service";
import { PositionHistoryIngestionCursorService } from "../position-history-ingestion-cursor";
import { PositionHistoryHistoricalWindowService } from "../position-history-historical-window";
import { PositionHistoryHorizonExecutionLockService } from "../position-history-horizon-execution/position-history-horizon-execution-lock.service";
import { PositionHistoryIngestionTelemetryService } from "../position-history-horizon-execution/position-history-ingestion-telemetry.service";
import { positionHistoryPolicyFloor } from "../position-history-horizon/position-history-policy-floor";
import { PositionHistoryHorizonPopulationService } from "../position-history-horizon-population/position-history-horizon-population.service";
import { PositionHistoryIngestionStatusService } from "../position-history-status/position-history-ingestion-status.service";
import { PositionHistoryContinuousIngestionPollerService } from "./position-history-continuous-ingestion-poller.service";
import { PositionHistoryContinuousIngestionStatusService } from "./position-history-continuous-ingestion-status.service";
import { PositionHistoryContinuousIngestionWorkerService } from "./position-history-continuous-ingestion-worker.service";
import {
  POSITION_HISTORY_CONTINUOUS_CLOCK,
  POSITION_HISTORY_CONTINUOUS_REPOSITORY,
  POSITION_HISTORY_CONTINUOUS_SLEEPER,
  POSITION_HISTORY_CONTINUOUS_TIMER,
} from "./position-history-continuous-ingestion.tokens";
import type { PositionHistoryContinuousCycleResult, PositionHistoryContinuousTimer } from "./position-history-continuous-ingestion.types";
import { PositionHistoryReplayWorkerService } from "./position-history-replay-worker.service";
import { POSITION_HISTORY_REPLAY_HEARTBEAT_SCHEDULER } from "./position-history-replay-orchestration.tokens";
import { PositionHistoryWorkloadCoordinatorService } from "./position-history-workload-coordinator.service";
import { PositionHistoryRetentionMaintenanceService } from "../position-history-retention/position-history-retention-maintenance.service";
import { PositionHistoryRetentionService } from "../position-history-retention/position-history-retention.service";
import {
  POSITION_HISTORY_REPLAY_REPOSITORY,
  PositionHistoryReplayRunStateService,
} from "../position-history-replay-generation";
import { PositionHistoryPopulationRunWorkerService } from "../position-history-population-runs/position-history-population-run-worker.service";
import { PositionHistoryPopulationRunStateService } from "../position-history-population-runs/position-history-population-run-state.service";
import {
  POSITION_HISTORY_POPULATION_RUN_CLOCK,
  POSITION_HISTORY_POPULATION_RUN_HEARTBEAT_SCHEDULER,
  POSITION_HISTORY_POPULATION_RUN_SLEEPER,
} from "../position-history-population-runs/position-history-population-run.tokens";

// Regression coverage for the telemetry wiring hotfix: every production writer must
// resolve the SAME Nest-managed PositionHistoryIngestionTelemetryService instance that
// PositionHistoryIngestionStatusService reads. Pre-fix, each writer's type-only import
// emitted Function as its DI token, so Nest injected undefined and every
// this.telemetry?.* write became a silent no-op while ingestion kept working.
// These tests resolve everything through a real Nest TestingModule, so they fail on
// the pre-fix constructor metadata and pass only when the wiring is restored.

const fixedNow = new Date("2026-09-14T12:00:00Z");
const continuousVehicleId = "123e4567-e89b-42d3-a456-426614174001";
const replayVehicleId = "123e4567-e89b-42d3-a456-426614174002";
const replayRunId = "123e4567-e89b-42d3-a456-426614174003";
const replayCheckpointId = "123e4567-e89b-42d3-a456-426614174004";
const replayAnchor = new Date("2026-09-14T02:00:00Z");
const populationRunId = "123e4567-e89b-42d3-a456-426614174005";

const emptyCycle: PositionHistoryContinuousCycleResult = {
  vehicles: 0, requests: 0, providerRows: 0, inserted: 0, duplicates: 0, invalid: 0,
  retries: 0, rateLimitResponses: 0, cursorAdvancements: 0, recentTailCompleted: 0,
  backlogCompleted: 0, providerBlocked: 0, failedWork: 0, lockUnavailable: 0,
};

function telemetryOf(service: object): unknown {
  return (service as unknown as { telemetry: unknown }).telemetry;
}

function apiConfig(): ApiConfig {
  return {
    positionHistoryContinuousIngestion: { enabled: true },
    positionHistoryRetention: { enabled: true },
  } as ApiConfig;
}

function databaseMock(): { getClient: () => unknown } {
  const client = {
    vehicle: { count: async (): Promise<number> => 0 },
    vehicleHistoryIngestionCursor: { findMany: async (): Promise<never[]> => [] },
    positionHistoryReplayRun: {
      findFirst: async (): Promise<null> => null,
      findMany: async (): Promise<never[]> => [],
    },
    positionHistoryReplayCheckpoint: { count: async (): Promise<number> => 0 },
    positionHistoryPopulationRun: { findFirst: async (): Promise<null> => null },
  };
  return { getClient: (): unknown => client };
}

function timerMock(): { timer: PositionHistoryContinuousTimer; timeouts: Map<string, () => void> } {
  const timeouts = new Map<string, () => void>();
  const intervals = new Map<string, () => void>();
  const timer: PositionHistoryContinuousTimer = {
    addTimeout: (name, callback): void => { timeouts.set(name, callback); },
    addInterval: (name, callback): void => { intervals.set(name, callback); },
    deleteTimeout: (name): void => { timeouts.delete(name); },
    deleteInterval: (name): void => { intervals.delete(name); },
  };
  return { timer, timeouts };
}

function continuousFakes(): {
  repository: unknown;
  cursors: unknown;
  historicalWindow: unknown;
  lock: unknown;
  clock: unknown;
  sleeper: unknown;
} {
  const now = new Date(fixedNow);
  const floor = positionHistoryPolicyFloor(now);
  const cursor = {
    vehicleId: continuousVehicleId,
    coverageFrom: new Date(floor),
    confirmedThrough: new Date("2026-09-01T01:00:00Z"),
    createdAt: new Date(now),
    updatedAt: new Date(now),
  };
  const repository = {
    listMappedVehicles: async (): Promise<unknown> => [{ vehicleId: continuousVehicleId, externalDeviceId: 77, disabled: false }],
    persistReplay: async (_vehicleId: string, candidates: readonly { fixFingerprint: string }[]): Promise<unknown> =>
      ({ inserted: candidates.length, duplicates: 0 }),
  };
  const cursors = {
    ensureCursor: async (): Promise<unknown> => cursor,
    findCursor: async (): Promise<unknown> => cursor,
    persistContiguousResult: async (input: { nextConfirmedThrough: Date; candidates: readonly { fixFingerprint: string }[] }): Promise<unknown> => {
      cursor.confirmedThrough = new Date(input.nextConfirmedThrough);
      return { inserted: input.candidates.length, duplicates: 0 };
    },
  };
  const historicalWindow = {
    read: async (request: { from: Date; to: Date }, options: { beforeRequestStart?: () => Promise<void> } = {}): Promise<unknown> => {
      await options.beforeRequestStart?.();
      return {
        fetchFrom: request.from, fetchTo: request.to, fetchedAt: new Date(now),
        providerRows: 1, candidates: [{ fixFingerprint: "wiring-regression" }],
        skippedInvalid: 0, requests: 1, retries: 0, rateLimitResponses: 0,
      };
    },
  };
  const lock = { runExclusive: async <T>(work: () => Promise<T>): Promise<T> => work() };
  const clock = { now: (): Date => new Date(now) };
  const sleeper = { sleep: async (): Promise<void> => undefined };
  return { repository, cursors, historicalWindow, lock, clock, sleeper };
}

function replayFakes(historicalWindow: unknown): { repository: unknown; state: unknown; heartbeat: unknown } {
  let run: PositionHistoryReplayRun = {
    id: replayRunId, kind: PositionHistoryReplayKind.DAILY_7_DAY, generationAnchor: new Date(replayAnchor),
    rangeFrom: new Date("2026-09-07T02:00:00Z"), rangeTo: new Date(replayAnchor),
    status: PositionHistoryReplayRunStatus.PENDING, leaseOwner: null, leaseExpiresAt: null,
    startedAt: null, completedAt: null, createdAt: new Date(replayAnchor), updatedAt: new Date(replayAnchor),
  };
  let checkpoint: PositionHistoryReplayCheckpoint = {
    id: replayCheckpointId, runId: replayRunId, vehicleId: replayVehicleId,
    rangeFrom: run.rangeFrom, rangeTo: run.rangeTo, nextFrom: run.rangeFrom,
    status: PositionBackfillStatus.PENDING, createdAt: new Date(replayAnchor), updatedAt: new Date(replayAnchor),
  };
  const repository = {
    listEligibleVehicles: async (): Promise<unknown> => [{ vehicleId: replayVehicleId, externalDeviceId: 78, disabled: false }],
    ensureRun: async (): Promise<unknown> => run,
    findRun: async (): Promise<unknown> => run,
    countCheckpoints: async (): Promise<number> => 1,
    ensureCheckpoints: async (): Promise<unknown> => [checkpoint],
    listIncompleteCheckpoints: async (): Promise<unknown> =>
      (checkpoint.status === PositionBackfillStatus.COMPLETED ? [] : [checkpoint]),
    countIncompleteCheckpoints: async (): Promise<number> =>
      (checkpoint.status === PositionBackfillStatus.COMPLETED ? 0 : 1),
    findMappedVehicle: async (): Promise<unknown> => ({ vehicleId: replayVehicleId, externalDeviceId: 78, disabled: false }),
    persistReplayWindow: async (input: { expectedNextFrom: Date; nextFrom: Date; candidates: readonly unknown[] }): Promise<unknown> => {
      assert.equal(input.expectedNextFrom.getTime(), checkpoint.nextFrom.getTime());
      checkpoint = {
        ...checkpoint,
        nextFrom: new Date(input.nextFrom),
        status: input.nextFrom.getTime() === checkpoint.rangeTo.getTime() ? PositionBackfillStatus.COMPLETED : PositionBackfillStatus.RUNNING,
      };
      return { inserted: input.candidates.length, duplicates: 0, checkpointStatus: checkpoint.status };
    },
    retireReplayCheckpointPrefix: async (): Promise<unknown> => checkpoint.status,
  };
  const state = {
    findClaimable: async (): Promise<unknown> => (run.status === PositionHistoryReplayRunStatus.PENDING ? run : null),
    claimRun: async (input: { leaseOwner: string; leaseExpiresAt: Date }): Promise<unknown> => {
      run = { ...run, status: PositionHistoryReplayRunStatus.RUNNING, leaseOwner: input.leaseOwner, leaseExpiresAt: input.leaseExpiresAt };
      return run;
    },
    renewLease: async (): Promise<boolean> => true,
    yieldRun: async (): Promise<boolean> => {
      run = { ...run, status: PositionHistoryReplayRunStatus.PENDING, leaseOwner: null, leaseExpiresAt: null };
      return true;
    },
    completeRun: async (): Promise<boolean> => {
      run = { ...run, status: PositionHistoryReplayRunStatus.COMPLETED, leaseOwner: null, leaseExpiresAt: null };
      return true;
    },
  };
  void historicalWindow;
  const heartbeat = { start: (): (() => void) => () => undefined };
  return { repository, state, heartbeat };
}

function retentionFake(): unknown {
  return {
    getRetentionPrecheck: async (): Promise<unknown> => ({ cursorFloorCandidates: 0, replayCheckpointCandidates: 0, hasFullyObsoleteCheckpoints: false, hasExecutableObservationWork: false }),
    executeAutomaticRetention: async (): Promise<never> => {
      throw new Error("no-work precheck must avoid the destructive core");
    },
  };
}

function populationFakes(): { state: unknown; population: unknown; clock: unknown; sleeper: unknown; scheduler: unknown } {
  let value: PositionHistoryPopulationRun = {
    id: populationRunId, status: PositionHistoryPopulationRunStatus.PENDING,
    initiatorType: PositionHistoryPopulationRunInitiatorType.SYSTEM, requestedByUserId: null,
    to: new Date("2026-08-13T00:00:00Z"), excludeProviderDisabled: true,
    windowBudget: 24, committedWindows: 0, createdAt: new Date(fixedNow), updatedAt: new Date(fixedNow),
    startedAt: null, finishedAt: null, leaseOwner: null, leaseExpiresAt: null, safeFailureCode: null,
  };
  const state = {
    findEligible: async (): Promise<unknown> => value,
    claim: async (_id: string, owner: string): Promise<unknown> => {
      value = { ...value, status: PositionHistoryPopulationRunStatus.RUNNING, leaseOwner: owner };
      return value;
    },
    getOwned: async (_id: string, owner: string): Promise<unknown> =>
      (value.status === PositionHistoryPopulationRunStatus.RUNNING && value.leaseOwner === owner ? value : null),
    heartbeat: async (): Promise<boolean> => true,
    succeed: async (_id: string, owner: string): Promise<boolean> => {
      if (value.leaseOwner !== owner) return false;
      value = { ...value, status: PositionHistoryPopulationRunStatus.SUCCEEDED, leaseOwner: null, leaseExpiresAt: null };
      return true;
    },
    fail: async (): Promise<boolean> => false,
    yield: async (): Promise<boolean> => false,
  };
  const population = {
    run: async (_to: Date, options: { maxWindows: number; beforeRequestStart?: () => Promise<void> }): Promise<unknown> => {
      await options.beforeRequestStart?.();
      value = { ...value, committedWindows: value.committedWindows + options.maxWindows };
      return { horizonComplete: true };
    },
  };
  const clock = { now: (): Date => new Date(fixedNow) };
  const sleeper = { sleep: async (): Promise<void> => undefined };
  const scheduler = { start: (): (() => void) => () => undefined };
  return { state, population, clock, sleeper, scheduler };
}

type WiringContext = {
  telemetry: PositionHistoryIngestionTelemetryService;
  poller: PositionHistoryContinuousIngestionPollerService;
  worker: PositionHistoryContinuousIngestionWorkerService;
  replay: PositionHistoryReplayWorkerService;
  retention: PositionHistoryRetentionMaintenanceService;
  population: PositionHistoryPopulationRunWorkerService;
  status: PositionHistoryIngestionStatusService;
};

let cached: WiringContext | null = null;

async function context(): Promise<WiringContext> {
  if (cached !== null) return cached;
  const continuous = continuousFakes();
  const replay = replayFakes(continuous.historicalWindow);
  const population = populationFakes();
  const { timer } = timerMock();
  const moduleRef = await Test.createTestingModule({
    providers: [
      PositionHistoryIngestionTelemetryService,
      { provide: API_CONFIG, useValue: apiConfig() },
      { provide: DatabaseService, useValue: databaseMock() },
      PositionHistoryContinuousIngestionStatusService,
      {
        provide: PositionHistoryWorkloadCoordinatorService,
        useValue: { processCycle: async (): Promise<PositionHistoryContinuousCycleResult> => emptyCycle },
      },
      { provide: POSITION_HISTORY_CONTINUOUS_TIMER, useValue: timer },
      PositionHistoryContinuousIngestionPollerService,
      { provide: POSITION_HISTORY_CONTINUOUS_REPOSITORY, useValue: continuous.repository },
      { provide: PositionHistoryIngestionCursorService, useValue: continuous.cursors },
      { provide: PositionHistoryHistoricalWindowService, useValue: continuous.historicalWindow },
      { provide: PositionHistoryHorizonExecutionLockService, useValue: continuous.lock },
      { provide: POSITION_HISTORY_CONTINUOUS_CLOCK, useValue: continuous.clock },
      { provide: POSITION_HISTORY_CONTINUOUS_SLEEPER, useValue: continuous.sleeper },
      PositionHistoryContinuousIngestionWorkerService,
      { provide: POSITION_HISTORY_REPLAY_REPOSITORY, useValue: replay.repository },
      { provide: PositionHistoryReplayRunStateService, useValue: replay.state },
      { provide: POSITION_HISTORY_REPLAY_HEARTBEAT_SCHEDULER, useValue: replay.heartbeat },
      PositionHistoryReplayWorkerService,
      { provide: PositionHistoryRetentionService, useValue: retentionFake() },
      PositionHistoryRetentionMaintenanceService,
      { provide: PositionHistoryPopulationRunStateService, useValue: population.state },
      { provide: PositionHistoryHorizonPopulationService, useValue: population.population },
      { provide: POSITION_HISTORY_POPULATION_RUN_HEARTBEAT_SCHEDULER, useValue: population.scheduler },
      { provide: POSITION_HISTORY_POPULATION_RUN_CLOCK, useValue: population.clock },
      { provide: POSITION_HISTORY_POPULATION_RUN_SLEEPER, useValue: population.sleeper },
      PositionHistoryPopulationRunWorkerService,
      PositionHistoryIngestionStatusService,
    ],
  }).compile();
  cached = {
    telemetry: moduleRef.get(PositionHistoryIngestionTelemetryService),
    poller: moduleRef.get(PositionHistoryContinuousIngestionPollerService),
    worker: moduleRef.get(PositionHistoryContinuousIngestionWorkerService),
    replay: moduleRef.get(PositionHistoryReplayWorkerService),
    retention: moduleRef.get(PositionHistoryRetentionMaintenanceService),
    population: moduleRef.get(PositionHistoryPopulationRunWorkerService),
    status: moduleRef.get(PositionHistoryIngestionStatusService),
  };
  return cached;
}

test("all five writers resolve the same Nest-managed telemetry singleton the status reader uses", async () => {
  const ctx = await context();
  for (const writer of [ctx.poller, ctx.worker, ctx.replay, ctx.retention, ctx.population]) {
    assert.equal(telemetryOf(writer), ctx.telemetry);
  }
  assert.equal(telemetryOf(ctx.status), ctx.telemetry);
});

test("Nest-resolved poller marks bootstrap and cycle telemetry visible to the status reader", async () => {
  const ctx = await context();
  ctx.poller.onApplicationBootstrap();
  await ctx.poller.poll();
  const response = await ctx.status.inspect();
  assert.equal(response.runtime.pollerStarted, true);
  assert.notEqual(response.runtime.lastCycleStartedAt, null);
  assert.notEqual(response.runtime.lastCycleCompletedAt, null);
});

test("Nest-resolved continuous worker request and recent-tail success reach the status reader", async () => {
  const ctx = await context();
  const before = await ctx.status.inspect();
  const result = await ctx.worker.processCycle(1, ["RECENT_TAIL"]);
  assert.equal(result.recentTailCompleted, 1);
  const after = await ctx.status.inspect();
  assert.ok(after.providerTraffic.requestStartsSinceProcessStart > before.providerTraffic.requestStartsSinceProcessStart);
  assert.ok(after.recentTail.successesSinceProcessStart > before.recentTail.successesSinceProcessStart);
  assert.notEqual(after.recentTail.lastSuccessAt, null);
});

test("Nest-resolved replay worker request telemetry reaches the same instance", async () => {
  const ctx = await context();
  const before = await ctx.status.inspect();
  const result = await ctx.replay.processKind(PositionHistoryReplayKind.DAILY_7_DAY);
  assert.ok(result.requests >= 1);
  const after = await ctx.status.inspect();
  assert.ok(after.providerTraffic.requestStartsSinceProcessStart > before.providerTraffic.requestStartsSinceProcessStart);
});

test("Nest-resolved retention evaluation records attempt telemetry visible to the status reader", async () => {
  const ctx = await context();
  const outcome = await ctx.retention.scheduledEvaluate();
  assert.equal(outcome.outcome, "NO_WORK");
  const response = await ctx.status.inspect();
  assert.equal(response.retention.lastOutcome, "SUCCESS");
  assert.notEqual(response.retention.lastAttemptAt, null);
  assert.notEqual(response.retention.lastCompletedAt, null);
});

test("Nest-resolved population worker request telemetry reaches the same instance", async () => {
  const ctx = await context();
  const before = await ctx.status.inspect();
  const result = await ctx.population.processNextAvailableRun();
  assert.equal(result.outcome, "SUCCEEDED");
  const after = await ctx.status.inspect();
  assert.ok(after.providerTraffic.requestStartsSinceProcessStart > before.providerTraffic.requestStartsSinceProcessStart);
});
