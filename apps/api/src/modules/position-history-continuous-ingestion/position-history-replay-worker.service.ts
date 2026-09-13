import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { EquGpsHttpError, EquGpsRateLimitError } from "@taxi-gps/equgps";
import { PositionHistoryReplayKind, type PositionHistoryReplayRun } from "../../generated/prisma/client";
import { PositionHistoryHistoricalWindowService } from "../position-history-historical-window";
import { recordedPositionHistoryHistoricalWindowFailureAccounting } from "../position-history-historical-window/position-history-historical-window-failure-diagnostics";
import { PositionHistoryAutomaticRequestPacer, POSITION_HISTORY_AUTOMATIC_REQUEST_START_GAP_MS } from "../position-history-horizon-execution";
import { PositionHistoryHorizonAlreadyRunningError, PositionHistoryHorizonExecutionLockService } from "../position-history-horizon-execution/position-history-horizon-execution-lock.service";
import { POSITION_HISTORY_REPLAY_REPOSITORY, PositionHistoryReplayRunStateService, type PositionHistoryReplayRepository } from "../position-history-replay-generation";
import { POSITION_HISTORY_CONTINUOUS_FINALITY_DELAY_MS } from "./position-history-continuous-ingestion.constants";
import { POSITION_HISTORY_CONTINUOUS_CLOCK, POSITION_HISTORY_CONTINUOUS_SLEEPER } from "./position-history-continuous-ingestion.tokens";
import type { PositionHistoryContinuousClock, PositionHistoryContinuousSleeper } from "./position-history-continuous-ingestion.types";
import { POSITION_HISTORY_REPLAY_FAILURE_BACKOFF_MS, POSITION_HISTORY_REPLAY_HEARTBEAT_MS, POSITION_HISTORY_REPLAY_LEASE_DURATION_MS, POSITION_HISTORY_REPLAY_STABLE_FAILURE_BACKOFF_MS, POSITION_HISTORY_REPLAY_WINDOW_MS } from "./position-history-replay-orchestration.constants";
import { POSITION_HISTORY_REPLAY_HEARTBEAT_SCHEDULER } from "./position-history-replay-orchestration.tokens";
import type { PositionHistoryReplayHeartbeatScheduler, PositionHistoryReplayQuantumResult } from "./position-history-replay-orchestration.types";
import { positionHistoryReplayCheckpoints, positionHistoryReplayTarget } from "./position-history-replay-planning";

type MutableResult = { -readonly [K in keyof PositionHistoryReplayQuantumResult]: PositionHistoryReplayQuantumResult[K] };

function emptyResult(kind: PositionHistoryReplayKind): MutableResult {
  return { kind, outcome: "NO_WORK", generationAnchor: null, requests: 0, providerRows: 0, inserted: 0, duplicates: 0, invalid: 0, retries: 0, rateLimitResponses: 0, checkpointWindowsCompleted: 0, checkpointsRemaining: null };
}

@Injectable()
export class PositionHistoryReplayWorkerService {
  private readonly nextEligible = new Map<string, number>();
  private readonly failures = new Map<string, number>();

  public constructor(
    @Inject(POSITION_HISTORY_REPLAY_REPOSITORY) private readonly repository: PositionHistoryReplayRepository,
    private readonly state: PositionHistoryReplayRunStateService,
    private readonly historicalWindow: PositionHistoryHistoricalWindowService,
    private readonly historyLock: PositionHistoryHorizonExecutionLockService,
    @Inject(POSITION_HISTORY_CONTINUOUS_CLOCK) private readonly clock: PositionHistoryContinuousClock,
    @Inject(POSITION_HISTORY_CONTINUOUS_SLEEPER) private readonly sleeper: PositionHistoryContinuousSleeper,
    @Inject(POSITION_HISTORY_REPLAY_HEARTBEAT_SCHEDULER) private readonly heartbeatScheduler: PositionHistoryReplayHeartbeatScheduler,
  ) {}

  public async processKind(kind: PositionHistoryReplayKind): Promise<PositionHistoryReplayQuantumResult> {
    const result = emptyResult(kind);
    if ((this.nextEligible.get(kind) ?? 0) > this.now().getTime()) return Object.freeze(result);
    try {
      return await this.historyLock.runExclusive(async () => this.processUnderLock(kind, result));
    } catch (error) {
      if (error instanceof PositionHistoryHorizonAlreadyRunningError) result.outcome = "LOCK_UNAVAILABLE";
      else {
        result.outcome = "FAILED";
        this.scheduleFailure(kind, error);
      }
      return Object.freeze(result);
    }
  }

  private async processUnderLock(kind: PositionHistoryReplayKind, result: MutableResult): Promise<PositionHistoryReplayQuantumResult> {
    const now = this.now();
    const safeNow = new Date(now.getTime() - POSITION_HISTORY_CONTINUOUS_FINALITY_DELAY_MS);
    const vehicles = await this.repository.listEligibleVehicles();
    if (vehicles.length === 0) return Object.freeze(result);

    const target = positionHistoryReplayTarget(kind, safeNow);
    await this.repository.ensureRun(target);
    const candidate = await this.state.findClaimable(now, kind);
    if (candidate === null) return Object.freeze(result);
    result.generationAnchor = new Date(candidate.generationAnchor.getTime());
    if ((this.nextEligible.get(candidate.id) ?? 0) > now.getTime()) return Object.freeze(result);

    if (await this.repository.countCheckpoints(candidate.id) === 0) {
      await this.repository.ensureCheckpoints(candidate.id, positionHistoryReplayCheckpoints(candidate, vehicles));
    }

    const leaseOwner = randomUUID();
    const claimed = await this.state.claimRun({ runId: candidate.id, leaseOwner, now, leaseExpiresAt: new Date(now.getTime() + POSITION_HISTORY_REPLAY_LEASE_DURATION_MS) });
    if (claimed === null) {
      result.outcome = "STALE";
      return Object.freeze(result);
    }

    const stopHeartbeat = this.heartbeatScheduler.start(async () => {
      const heartbeatNow = this.now();
      await this.state.renewLease({ runId: claimed.id, leaseOwner, now: heartbeatNow, leaseExpiresAt: new Date(heartbeatNow.getTime() + POSITION_HISTORY_REPLAY_LEASE_DURATION_MS) });
    }, POSITION_HISTORY_REPLAY_HEARTBEAT_MS);
    const pacer = new PositionHistoryAutomaticRequestPacer(this.clock, this.sleeper, POSITION_HISTORY_AUTOMATIC_REQUEST_START_GAP_MS);
    try {
      const checkpoint = (await this.repository.listIncompleteCheckpoints(claimed.id, 1))[0];
      if (checkpoint === undefined) {
        result.outcome = await this.state.completeRun({ runId: claimed.id, leaseOwner, now: this.now() }) ? "COMPLETED_RUN" : "STALE";
        return Object.freeze(result);
      }
      const vehicle = await this.repository.findMappedVehicle(checkpoint.vehicleId);
      if (vehicle === null || vehicle.disabled) {
        result.outcome = await this.state.yieldRun({ runId: claimed.id, leaseOwner, now: this.now() }) ? "YIELDED" : "STALE";
        this.nextEligible.set(claimed.id, this.now().getTime() + POSITION_HISTORY_REPLAY_STABLE_FAILURE_BACKOFF_MS);
        return Object.freeze(result);
      }

      try {
        const windowTo = new Date(Math.min(checkpoint.nextFrom.getTime() + POSITION_HISTORY_REPLAY_WINDOW_MS, checkpoint.rangeTo.getTime()));
        const response = await this.historicalWindow.read(
          { externalDeviceId: vehicle.externalDeviceId, from: checkpoint.nextFrom, to: windowTo },
          { beforeRequestStart: async () => { await pacer.beforeRequestStart(); result.requests += 1; } },
        );
        const persisted = await this.repository.persistReplayWindow({
          runId: claimed.id,
          leaseOwner,
          checkpointId: checkpoint.id,
          vehicleId: checkpoint.vehicleId,
          expectedNextFrom: checkpoint.nextFrom,
          nextFrom: windowTo,
          candidates: response.candidates,
        });
        result.providerRows += response.providerRows;
        result.inserted += persisted.inserted;
        result.duplicates += persisted.duplicates;
        result.invalid += response.skippedInvalid;
        result.retries += response.retries;
        result.rateLimitResponses += response.rateLimitResponses;
        result.checkpointWindowsCompleted += 1;
        result.checkpointsRemaining = await this.repository.countIncompleteCheckpoints(claimed.id);
        this.failures.delete(claimed.id);
        this.nextEligible.delete(claimed.id);
        if (result.checkpointsRemaining === 0) result.outcome = await this.state.completeRun({ runId: claimed.id, leaseOwner, now: this.now() }) ? "COMPLETED_RUN" : "STALE";
        else result.outcome = await this.state.yieldRun({ runId: claimed.id, leaseOwner, now: this.now() }) ? "COMPLETED_WINDOW" : "STALE";
      } catch (error) {
        const accounting = recordedPositionHistoryHistoricalWindowFailureAccounting(error);
        result.retries += accounting?.retries ?? Math.max(0, pacer.requestStarts() - 1);
        result.rateLimitResponses += accounting?.rateLimitResponses ?? (error instanceof EquGpsRateLimitError ? 1 : 0);
        await this.state.yieldRun({ runId: claimed.id, leaseOwner, now: this.now() });
        result.outcome = "FAILED";
        this.scheduleRunFailure(claimed, error);
      }
      return Object.freeze(result);
    } finally {
      try { await pacer.coolBeforeLockRelease(); }
      finally { stopHeartbeat(); }
    }
  }

  private scheduleRunFailure(run: PositionHistoryReplayRun, error: unknown): void {
    const now = this.now().getTime();
    if (error instanceof EquGpsHttpError && error.status !== undefined && error.status >= 400 && error.status < 500) {
      this.nextEligible.set(run.id, now + POSITION_HISTORY_REPLAY_STABLE_FAILURE_BACKOFF_MS);
      return;
    }
    const count = (this.failures.get(run.id) ?? 0) + 1;
    this.failures.set(run.id, count);
    const delay = POSITION_HISTORY_REPLAY_FAILURE_BACKOFF_MS[Math.min(count - 1, POSITION_HISTORY_REPLAY_FAILURE_BACKOFF_MS.length - 1)]!;
    this.nextEligible.set(run.id, now + delay);
  }

  private scheduleFailure(kind: PositionHistoryReplayKind, error: unknown): void {
    const delay = error instanceof EquGpsHttpError && error.status !== undefined && error.status >= 400 && error.status < 500
      ? POSITION_HISTORY_REPLAY_STABLE_FAILURE_BACKOFF_MS
      : POSITION_HISTORY_REPLAY_FAILURE_BACKOFF_MS[0];
    this.nextEligible.set(kind, this.now().getTime() + delay);
  }

  private now(): Date {
    const value = this.clock.now();
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new Error("Invalid replay history clock.");
    return new Date(value.getTime());
  }
}
