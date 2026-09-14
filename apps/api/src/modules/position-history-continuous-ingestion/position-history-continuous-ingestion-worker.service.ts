import { Inject, Injectable } from "@nestjs/common";
import { EquGpsHttpError, EquGpsRateLimitError } from "@taxi-gps/equgps";
import { PositionHistoryHistoricalWindowService } from "../position-history-historical-window";
import { recordedPositionHistoryHistoricalWindowFailureAccounting } from "../position-history-historical-window/position-history-historical-window-failure-diagnostics";
import { PositionHistoryIngestionCursorService, type VehicleHistoryIngestionCursor } from "../position-history-ingestion-cursor";
import { PositionHistoryAutomaticRequestPacer } from "../position-history-horizon-execution";
import { PositionHistoryHorizonAlreadyRunningError, PositionHistoryHorizonExecutionLockService } from "../position-history-horizon-execution/position-history-horizon-execution-lock.service";
import { positionHistoryPolicyFloor } from "../position-history-horizon/position-history-policy-floor";
import { POSITION_HISTORY_CONTINUOUS_CAUGHT_UP_CADENCE_MS, POSITION_HISTORY_CONTINUOUS_FAILURE_BACKOFF_MS, POSITION_HISTORY_CONTINUOUS_FINALITY_DELAY_MS, POSITION_HISTORY_CONTINUOUS_PROVIDER_BLOCKED_CADENCE_MS, POSITION_HISTORY_CONTINUOUS_REQUESTS_PER_CYCLE, POSITION_HISTORY_CONTINUOUS_REQUEST_START_GAP_MS } from "./position-history-continuous-ingestion.constants";
import { contiguousBacklogRange, recentTailRange } from "./position-history-continuous-ingestion-planning";
import { POSITION_HISTORY_CONTINUOUS_CLOCK, POSITION_HISTORY_CONTINUOUS_REPOSITORY, POSITION_HISTORY_CONTINUOUS_SLEEPER } from "./position-history-continuous-ingestion.tokens";
import type { PositionHistoryContinuousClock, PositionHistoryContinuousCycleResult, PositionHistoryContinuousIngestionRepository, PositionHistoryContinuousLane, PositionHistoryContinuousSleeper, PositionHistoryContinuousVehicleState } from "./position-history-continuous-ingestion.types";

type MutableResult = { -readonly [K in keyof PositionHistoryContinuousCycleResult]: PositionHistoryContinuousCycleResult[K] };
type Work = Readonly<{ lane: PositionHistoryContinuousLane; state: PositionHistoryContinuousVehicleState }>;

function emptyResult(): MutableResult {
  return { vehicles: 0, requests: 0, providerRows: 0, inserted: 0, duplicates: 0, invalid: 0, retries: 0, rateLimitResponses: 0, cursorAdvancements: 0, recentTailCompleted: 0, backlogCompleted: 0, providerBlocked: 0, failedWork: 0, lockUnavailable: 0 };
}

function key(lane: PositionHistoryContinuousLane, vehicleId: string): string { return `${lane}:${vehicleId}`; }

@Injectable()
export class PositionHistoryContinuousIngestionWorkerService {
  private readonly nextEligible = new Map<string, number>();
  private readonly failureCounts = new Map<string, number>();
  private readonly recentSuccess = new Map<string, number>();
  private readonly blockedUntil = new Map<string, number>();
  private globalCooldownUntil = 0;

  public constructor(
    @Inject(POSITION_HISTORY_CONTINUOUS_REPOSITORY) private readonly repository: PositionHistoryContinuousIngestionRepository,
    private readonly cursors: PositionHistoryIngestionCursorService,
    private readonly historicalWindow: PositionHistoryHistoricalWindowService,
    private readonly historyLock: PositionHistoryHorizonExecutionLockService,
    @Inject(POSITION_HISTORY_CONTINUOUS_CLOCK) private readonly clock: PositionHistoryContinuousClock,
    @Inject(POSITION_HISTORY_CONTINUOUS_SLEEPER) private readonly sleeper: PositionHistoryContinuousSleeper,
  ) {}

  public async processCycle(maxOpportunities = POSITION_HISTORY_CONTINUOUS_REQUESTS_PER_CYCLE): Promise<PositionHistoryContinuousCycleResult> {
    if (!Number.isSafeInteger(maxOpportunities) || maxOpportunities < 1 || maxOpportunities > POSITION_HISTORY_CONTINUOUS_REQUESTS_PER_CYCLE) throw new Error("Invalid continuous history opportunity budget.");
    const now = this.now();
    const safeNow = new Date(now.getTime() - POSITION_HISTORY_CONTINUOUS_FINALITY_DELAY_MS);
    const vehicles = await this.repository.listMappedVehicles();
    const states: PositionHistoryContinuousVehicleState[] = [];
    for (const vehicle of vehicles) states.push(Object.freeze({ vehicle, cursor: await this.cursors.ensureCursor(vehicle.vehicleId, now) }));

    const result = emptyResult();
    result.vehicles = states.length;
    const plan = this.plan(states, now, safeNow, maxOpportunities);
    for (const work of plan) {
      if (this.now().getTime() < this.globalCooldownUntil) break;
      await this.processWork(work, safeNow, result);
    }
    return Object.freeze(result);
  }

  private plan(states: readonly PositionHistoryContinuousVehicleState[], now: Date, safeNow: Date, maxOpportunities: number): readonly Work[] {
    const tailFrom = recentTailRange(safeNow).fetchFrom.getTime();
    const due = (lane: PositionHistoryContinuousLane, state: PositionHistoryContinuousVehicleState): boolean => {
      const vehicleId = state.vehicle.vehicleId;
      if ((this.blockedUntil.get(vehicleId) ?? 0) > now.getTime()) return false;
      if ((this.nextEligible.get(key(lane, vehicleId)) ?? 0) > now.getTime()) return false;
      if (lane === "RECENT_TAIL") return !state.vehicle.disabled && state.cursor.confirmedThrough.getTime() < tailFrom;
      if (state.cursor.confirmedThrough.getTime() >= safeNow.getTime()) {
        this.nextEligible.set(key(lane, vehicleId), now.getTime() + POSITION_HISTORY_CONTINUOUS_CAUGHT_UP_CADENCE_MS);
        return false;
      }
      return true;
    };

    const recent = states.filter((state) => due("RECENT_TAIL", state)).sort((left, right) => {
      const bySuccess = (this.recentSuccess.get(left.vehicle.vehicleId) ?? 0) - (this.recentSuccess.get(right.vehicle.vehicleId) ?? 0);
      return bySuccess || left.vehicle.vehicleId.localeCompare(right.vehicle.vehicleId);
    });
    const backlog = states.filter((state) => due("CONTIGUOUS_BACKLOG", state)).sort((left, right) => {
      const byProgress = left.cursor.confirmedThrough.getTime() - right.cursor.confirmedThrough.getTime();
      return byProgress || left.vehicle.vehicleId.localeCompare(right.vehicle.vehicleId);
    });

    const plan: Work[] = [];
    let recentIndex = 0;
    let backlogIndex = 0;
    for (let slot = 0; slot < maxOpportunities; slot += 1) {
      const preferRecent = slot % 2 === 0;
      const recentState = recent[recentIndex];
      const backlogState = backlog[backlogIndex];
      if (preferRecent && recentState !== undefined) { plan.push({ lane: "RECENT_TAIL", state: recentState }); recentIndex += 1; }
      else if (!preferRecent && backlogState !== undefined) { plan.push({ lane: "CONTIGUOUS_BACKLOG", state: backlogState }); backlogIndex += 1; }
      else if (recentState !== undefined) { plan.push({ lane: "RECENT_TAIL", state: recentState }); recentIndex += 1; }
      else if (backlogState !== undefined) { plan.push({ lane: "CONTIGUOUS_BACKLOG", state: backlogState }); backlogIndex += 1; }
      else break;
    }
    return Object.freeze(plan);
  }

  private async processWork(work: Work, safeNow: Date, result: MutableResult): Promise<void> {
    try {
      await this.historyLock.runExclusive(async () => {
        const now = this.now();
        const vehicle = work.state.vehicle;
        const streamKey = key(work.lane, vehicle.vehicleId);
        if ((this.blockedUntil.get(vehicle.vehicleId) ?? 0) > now.getTime() || (this.nextEligible.get(streamKey) ?? 0) > now.getTime()) return;
        const cursor = await this.cursors.findCursor(vehicle.vehicleId);
        if (cursor === null) return;
        const pacer = new PositionHistoryAutomaticRequestPacer(this.clock, this.sleeper, POSITION_HISTORY_CONTINUOUS_REQUEST_START_GAP_MS);
        const beforeRequestStart = async (): Promise<void> => {
          await pacer.beforeRequestStart();
          result.requests += 1;
        };
        try {
          if (work.lane === "RECENT_TAIL") await this.processRecent(vehicle.externalDeviceId, cursor, safeNow, beforeRequestStart, result);
          else await this.processBacklog(vehicle.externalDeviceId, vehicle.disabled, cursor, safeNow, beforeRequestStart, result);
          this.failureCounts.delete(streamKey);
        } catch (error) {
          result.failedWork += 1;
          const failedAt = this.now();
          const failureAccounting = recordedPositionHistoryHistoricalWindowFailureAccounting(error);
          result.retries += failureAccounting?.retries ?? Math.max(0, pacer.requestStarts() - 1);
          result.rateLimitResponses += failureAccounting?.rateLimitResponses ?? (error instanceof EquGpsRateLimitError ? 1 : 0);
          if ((failureAccounting?.rateLimitResponses ?? 0) > 0 || error instanceof EquGpsRateLimitError) {
            this.globalCooldownUntil = failedAt.getTime() + POSITION_HISTORY_CONTINUOUS_FAILURE_BACKOFF_MS[0];
          }
          if (error instanceof EquGpsHttpError && error.status !== undefined && error.status >= 400 && error.status < 500) {
            result.providerBlocked += 1;
            this.blockedUntil.set(vehicle.vehicleId, failedAt.getTime() + POSITION_HISTORY_CONTINUOUS_PROVIDER_BLOCKED_CADENCE_MS);
          } else this.scheduleFailure(streamKey, vehicle.vehicleId, failedAt);
        } finally {
          await pacer.coolBeforeLockRelease();
        }
      });
    } catch (error) {
      if (error instanceof PositionHistoryHorizonAlreadyRunningError) result.lockUnavailable += 1;
      else result.failedWork += 1;
    }
  }

  private async processRecent(externalDeviceId: number, cursor: VehicleHistoryIngestionCursor, safeNow: Date, beforeRequestStart: () => Promise<void>, result: MutableResult): Promise<void> {
    const range = recentTailRange(safeNow);
    const activeFloor = Math.max(cursor.coverageFrom.getTime(), positionHistoryPolicyFloor(this.now()).getTime());
    const fetchFrom = new Date(Math.max(range.fetchFrom.getTime(), activeFloor));
    if (fetchFrom.getTime() >= range.fetchTo.getTime() || cursor.confirmedThrough.getTime() >= fetchFrom.getTime()) return;
    const response = await this.historicalWindow.read({ externalDeviceId, from: fetchFrom, to: range.fetchTo }, { beforeRequestStart });
    const persisted = await this.repository.persistReplay(cursor.vehicleId, response.candidates);
    this.account(response, persisted, result);
    result.recentTailCompleted += 1;
    const now = this.now().getTime();
    this.recentSuccess.set(cursor.vehicleId, now);
    this.nextEligible.set(key("RECENT_TAIL", cursor.vehicleId), now + POSITION_HISTORY_CONTINUOUS_CAUGHT_UP_CADENCE_MS);
  }

  private async processBacklog(externalDeviceId: number, disabled: boolean, cursor: VehicleHistoryIngestionCursor, safeNow: Date, beforeRequestStart: () => Promise<void>, result: MutableResult): Promise<void> {
    const currentPolicyFloor = positionHistoryPolicyFloor(this.now());
    if (cursor.coverageFrom.getTime() < currentPolicyFloor.getTime()) {
      this.nextEligible.set(key("CONTIGUOUS_BACKLOG", cursor.vehicleId), this.now().getTime() + POSITION_HISTORY_CONTINUOUS_CAUGHT_UP_CADENCE_MS);
      return;
    }
    const range = contiguousBacklogRange(cursor, safeNow);
    if (range === null) return;
    const response = await this.historicalWindow.read({ externalDeviceId, from: range.fetchFrom, to: range.fetchTo }, { beforeRequestStart });
    const persisted = await this.cursors.persistContiguousResult({ vehicleId: cursor.vehicleId, expectedCoverageFrom: range.expectedCoverageFrom, expectedConfirmedThrough: range.expectedConfirmedThrough, nextConfirmedThrough: range.nextConfirmedThrough, candidates: response.candidates });
    this.account(response, persisted, result);
    result.cursorAdvancements += 1;
    result.backlogCompleted += 1;
    const now = this.now().getTime();
    if (disabled) this.nextEligible.set(key("CONTIGUOUS_BACKLOG", cursor.vehicleId), now + POSITION_HISTORY_CONTINUOUS_PROVIDER_BLOCKED_CADENCE_MS);
    else if (range.nextConfirmedThrough.getTime() >= safeNow.getTime()) this.nextEligible.set(key("CONTIGUOUS_BACKLOG", cursor.vehicleId), now + POSITION_HISTORY_CONTINUOUS_CAUGHT_UP_CADENCE_MS);
  }

  private account(response: Readonly<{ providerRows: number; candidates: readonly unknown[]; skippedInvalid: number; retries: number; rateLimitResponses: number }>, persisted: Readonly<{ inserted: number; duplicates: number }>, result: MutableResult): void {
    result.providerRows += response.providerRows;
    result.inserted += persisted.inserted;
    result.duplicates += persisted.duplicates;
    result.invalid += response.skippedInvalid;
    result.retries += response.retries;
    result.rateLimitResponses += response.rateLimitResponses;
  }

  private scheduleFailure(streamKey: string, vehicleId: string, now: Date): void {
    const failures = (this.failureCounts.get(streamKey) ?? 0) + 1;
    this.failureCounts.set(streamKey, failures);
    const delay = POSITION_HISTORY_CONTINUOUS_FAILURE_BACKOFF_MS[Math.min(failures - 1, POSITION_HISTORY_CONTINUOUS_FAILURE_BACKOFF_MS.length - 1)]!;
    this.nextEligible.set(streamKey, now.getTime() + delay);
    this.blockedUntil.set(vehicleId, now.getTime() + delay);
  }

  private now(): Date {
    const value = this.clock.now();
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new Error("Invalid continuous history clock.");
    return new Date(value.getTime());
  }
}
