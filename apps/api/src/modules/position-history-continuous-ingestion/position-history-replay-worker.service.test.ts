import assert from "node:assert/strict";
import test from "node:test";
import { PositionBackfillStatus, PositionHistoryReplayKind, PositionHistoryReplayRunStatus, type PositionHistoryReplayCheckpoint, type PositionHistoryReplayRun } from "../../generated/prisma/client";
import { PositionHistoryHistoricalWindowOversizedError, type PositionHistoryHistoricalWindowService } from "../position-history-historical-window";
import { PositionHistoryHorizonAlreadyRunningError, type PositionHistoryHorizonExecutionLockService } from "../position-history-horizon-execution/position-history-horizon-execution-lock.service";
import { positionHistoryPolicyFloor } from "../position-history-horizon/position-history-policy-floor";
import type { PositionHistoryReplayRepository, PositionHistoryReplayRunStateService } from "../position-history-replay-generation";
import { PositionHistoryReplayWorkerService } from "./position-history-replay-worker.service";

const runId = "123e4567-e89b-42d3-a456-426614174001";
const vehicleId = "123e4567-e89b-42d3-a456-426614174002";
const checkpointId = "123e4567-e89b-42d3-a456-426614174003";
const anchor = new Date("2026-09-14T02:00:00Z");

function harness(mode: "success" | "empty" | "provider-failure" | "oversized-until-one-hour" = "success", eligibleVehicles = true) {
  let milliseconds = Date.parse("2026-09-14T03:00:00Z");
  let providerCalls = 0;
  let persistedCandidates = 0;
  let run: PositionHistoryReplayRun = { id: runId, kind: PositionHistoryReplayKind.DAILY_7_DAY, generationAnchor: anchor, rangeFrom: new Date("2026-09-07T02:00:00Z"), rangeTo: anchor, status: PositionHistoryReplayRunStatus.PENDING, leaseOwner: null, leaseExpiresAt: null, startedAt: null, completedAt: null, createdAt: anchor, updatedAt: anchor };
  let checkpoint: PositionHistoryReplayCheckpoint = { id: checkpointId, runId, vehicleId, rangeFrom: run.rangeFrom, rangeTo: run.rangeTo, nextFrom: run.rangeFrom, status: PositionBackfillStatus.PENDING, createdAt: anchor, updatedAt: anchor };
  const repository = {
    listEligibleVehicles: async () => eligibleVehicles ? [{ vehicleId, externalDeviceId: 77, disabled: false }] : [],
    ensureRun: async () => run,
    findRun: async (kind: PositionHistoryReplayKind, generationAnchor: Date) => run.kind === kind && run.generationAnchor.getTime() === generationAnchor.getTime() ? run : null,
    countCheckpoints: async () => 1,
    ensureCheckpoints: async () => [checkpoint],
    listIncompleteCheckpoints: async () => checkpoint.status === PositionBackfillStatus.COMPLETED ? [] : [checkpoint],
    countIncompleteCheckpoints: async () => checkpoint.status === PositionBackfillStatus.COMPLETED ? 0 : 1,
    findMappedVehicle: async () => ({ vehicleId, externalDeviceId: 77, disabled: false }),
    persistReplayWindow: async (input: any) => {
      assert.equal(input.expectedNextFrom.getTime(), checkpoint.nextFrom.getTime());
      persistedCandidates += input.candidates.length;
      checkpoint = { ...checkpoint, nextFrom: input.nextFrom, status: input.nextFrom.getTime() === checkpoint.rangeTo.getTime() ? PositionBackfillStatus.COMPLETED : PositionBackfillStatus.RUNNING };
      return { inserted: input.candidates.length, duplicates: 0, checkpointStatus: checkpoint.status };
    },
    retireReplayCheckpointPrefix: async (input: any) => {
      assert.equal(input.expectedNextFrom.getTime(), checkpoint.nextFrom.getTime());
      checkpoint = { ...checkpoint, nextFrom: input.nextFrom, status: input.nextFrom.getTime() === checkpoint.rangeTo.getTime() ? PositionBackfillStatus.COMPLETED : PositionBackfillStatus.RUNNING };
      return checkpoint.status;
    },
  } as unknown as PositionHistoryReplayRepository;
  const state = {
    findClaimable: async () => run.status === PositionHistoryReplayRunStatus.PENDING ? run : null,
    claimRun: async (input: any) => { run = { ...run, status: PositionHistoryReplayRunStatus.RUNNING, leaseOwner: input.leaseOwner, leaseExpiresAt: input.leaseExpiresAt, startedAt: run.startedAt ?? input.now }; return run; },
    renewLease: async () => true,
    yieldRun: async () => { run = { ...run, status: PositionHistoryReplayRunStatus.PENDING, leaseOwner: null, leaseExpiresAt: null }; return true; },
    completeRun: async () => { run = { ...run, status: PositionHistoryReplayRunStatus.COMPLETED, leaseOwner: null, leaseExpiresAt: null, completedAt: new Date(milliseconds) }; return true; },
  } as unknown as PositionHistoryReplayRunStateService;
  const historical = { read: async (request: { from: Date; to: Date }, options: { beforeRequestStart?: () => Promise<void> }) => {
    await options.beforeRequestStart?.(); providerCalls += 1;
    if (mode === "provider-failure") throw new Error("safe fake failure");
    if (mode === "oversized-until-one-hour" && request.to.getTime() - request.from.getTime() > 3_600_000) throw new PositionHistoryHistoricalWindowOversizedError();
    const candidates = mode === "success" ? [{ fixFingerprint: "fingerprint" }] : [];
    return { fetchFrom: request.from, fetchTo: request.to, fetchedAt: new Date(milliseconds), providerRows: candidates.length, candidates, skippedInvalid: 0, requests: 1, retries: 0, rateLimitResponses: 0 };
  } } as unknown as PositionHistoryHistoricalWindowService;
  const lock = { runExclusive: async <T>(work: () => Promise<T>) => work() } as PositionHistoryHorizonExecutionLockService;
  const clock = { now: () => new Date(milliseconds) };
  const sleeper = { sleep: async (durationMs: number) => { milliseconds += durationMs; } };
  const heartbeat = { start: () => () => undefined };
  return { worker: new PositionHistoryReplayWorkerService(repository, state, historical, lock, clock, sleeper, heartbeat), checkpoint: () => checkpoint, run: () => run, providerCalls: () => providerCalls, persistedCandidates: () => persistedCandidates, lock };
}

test("daily replay executes one six-hour window, persists through replay CAS, then yields", async () => {
  const item = harness("success");
  const result = await item.worker.processKind(PositionHistoryReplayKind.DAILY_7_DAY);
  assert.equal(result.outcome, "COMPLETED_WINDOW");
  assert.equal(result.requests, 1);
  assert.equal(result.inserted, 1);
  assert.equal(item.persistedCandidates(), 1);
  assert.equal(item.checkpoint().nextFrom.getTime(), Date.parse("2026-09-07T08:00:00Z"));
  assert.equal(item.run().status, PositionHistoryReplayRunStatus.PENDING);
});

test("pressure reports a missing/current generation due and an older incomplete generation overdue", async () => {
  const current = harness("empty");
  assert.deepEqual(await current.worker.inspectPressure(PositionHistoryReplayKind.DAILY_7_DAY), { due: true, overdue: false });
  Object.assign(current.run(), { generationAnchor: new Date("2026-09-13T02:00:00Z") });
  assert.deepEqual(await current.worker.inspectPressure(PositionHistoryReplayKind.DAILY_7_DAY), { due: true, overdue: true });
});

test("valid empty replay advances generation progress without fabricating cursor work", async () => {
  const item = harness("empty");
  const before = item.checkpoint().nextFrom.getTime();
  const result = await item.worker.processKind(PositionHistoryReplayKind.DAILY_7_DAY);
  assert.equal(result.outcome, "COMPLETED_WINDOW");
  assert.equal(result.inserted, 0);
  assert.equal(item.checkpoint().nextFrom.getTime(), before + 6 * 3_600_000);
});

test("typed oversized replay windows fall back 6h to 3h to 1h without advancing rejected spans", async () => {
  const item = harness("oversized-until-one-hour");
  const before = item.checkpoint().nextFrom.getTime();
  const result = await item.worker.processKind(PositionHistoryReplayKind.DAILY_7_DAY);
  assert.equal(result.outcome, "COMPLETED_WINDOW");
  assert.equal(result.requests, 3);
  assert.equal(item.providerCalls(), 3);
  assert.equal(item.checkpoint().nextFrom.getTime(), before + 3_600_000);
});

test("expired replay prefix is policy-retired with zero provider request and remains resumable", async () => {
  const item = harness("success");
  Object.assign(item.checkpoint(), { rangeFrom: new Date("2026-06-01T02:00:00Z"), nextFrom: new Date("2026-06-05T02:00:00Z"), rangeTo: new Date("2026-06-20T02:00:00Z") });
  const result = await item.worker.processKind(PositionHistoryReplayKind.DAILY_7_DAY);
  assert.equal(result.outcome, "YIELDED");
  assert.equal(result.policyRetiredPrefixes, 1);
  assert.equal(result.requests, 0);
  assert.equal(item.providerCalls(), 0);
  assert.equal(item.checkpoint().nextFrom.toISOString(), positionHistoryPolicyFloor(new Date("2026-09-14T03:00:00Z")).toISOString());
  assert.equal(item.checkpoint().status, PositionBackfillStatus.RUNNING);
  const continued = await item.worker.processKind(PositionHistoryReplayKind.DAILY_7_DAY);
  assert.equal(continued.outcome, "COMPLETED_WINDOW");
  assert.equal(item.providerCalls(), 1);
  assert.equal(item.checkpoint().nextFrom.toISOString(), "2026-06-10T08:00:00.000Z");
});

test("fully expired replay checkpoint settles and completes its run with zero provider request", async () => {
  const item = harness("success");
  Object.assign(item.checkpoint(), { rangeFrom: new Date("2026-06-01T02:00:00Z"), nextFrom: new Date("2026-06-05T02:00:00Z"), rangeTo: new Date("2026-06-10T02:00:00Z") });
  const result = await item.worker.processKind(PositionHistoryReplayKind.DAILY_7_DAY);
  assert.equal(result.outcome, "COMPLETED_RUN");
  assert.equal(result.policyRetiredPrefixes, 1);
  assert.equal(result.requests, 0);
  assert.equal(item.providerCalls(), 0);
  assert.equal(item.checkpoint().nextFrom.toISOString(), "2026-06-10T02:00:00.000Z");
  assert.equal(item.run().status, PositionHistoryReplayRunStatus.COMPLETED);
});

test("expired generation settles even when no vehicle is currently provider-eligible", async () => {
  const item = harness("success", false);
  Object.assign(item.checkpoint(), { rangeFrom: new Date("2026-06-01T02:00:00Z"), nextFrom: new Date("2026-06-05T02:00:00Z"), rangeTo: new Date("2026-06-10T02:00:00Z") });
  const result = await item.worker.processKind(PositionHistoryReplayKind.DAILY_7_DAY);
  assert.equal(result.outcome, "COMPLETED_RUN");
  assert.equal(result.requests, 0);
  assert.equal(item.providerCalls(), 0);
});

test("final replay checkpoint window completes the run only after persisted checkpoint completion", async () => {
  const item = harness("empty");
  (item.checkpoint() as any).nextFrom = new Date(anchor.getTime() - 3_600_000);
  const result = await item.worker.processKind(PositionHistoryReplayKind.DAILY_7_DAY);
  assert.equal(result.outcome, "COMPLETED_RUN");
  assert.equal(result.checkpointsRemaining, 0);
  assert.equal(item.run().status, PositionHistoryReplayRunStatus.COMPLETED);
});

test("provider failure leaves checkpoint progress unchanged and generation retryable", async () => {
  const item = harness("provider-failure");
  const before = item.checkpoint().nextFrom.getTime();
  const result = await item.worker.processKind(PositionHistoryReplayKind.DAILY_7_DAY);
  assert.equal(result.outcome, "FAILED");
  assert.equal(item.checkpoint().nextFrom.getTime(), before);
  assert.equal(item.run().status, PositionHistoryReplayRunStatus.PENDING);
});

test("lock unavailable performs zero provider requests", async () => {
  const item = harness();
  (item.worker as any).historyLock = { runExclusive: async () => { throw new PositionHistoryHorizonAlreadyRunningError(); } };
  const result = await item.worker.processKind(PositionHistoryReplayKind.DAILY_7_DAY);
  assert.equal(result.outcome, "LOCK_UNAVAILABLE");
  assert.equal(item.providerCalls(), 0);
});
