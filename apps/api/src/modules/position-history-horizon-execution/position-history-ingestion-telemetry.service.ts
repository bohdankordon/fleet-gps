import { Injectable, Optional } from "@nestjs/common";
import {
  EquGpsHttpError,
  EquGpsNetworkError,
  EquGpsRateLimitError,
  EquGpsResponseValidationError,
  EquGpsTimeoutError,
} from "@taxi-gps/equgps";
import { recordedPositionHistoryHistoricalWindowProviderFailure } from "../position-history-historical-window/position-history-historical-window-failure-diagnostics";
import { PositionHistoryBackfillProviderContractError } from "../position-history-historical-window/position-history-historical-window.errors";
import { POSITION_HISTORY_CONTINUOUS_POLL_INTERVAL_MS } from "../position-history-continuous-ingestion/position-history-continuous-poll-timing";

export type PositionHistoryIngestionFailureCategory =
  | "rate_limit"
  | "provider_5xx"
  | "network"
  | "timeout"
  | "contract"
  | "storage"
  | "provider_blocked"
  | "unknown";

export type PositionHistoryIngestionTelemetryClock = Readonly<{ now(): Date }>;
export type PositionHistoryRetentionTelemetryOutcome = "NOT_OBSERVED_THIS_PROCESS" | "SUCCESS" | "SKIPPED" | "FAILED";
export type PositionHistoryRetentionTelemetrySkipCategory = "LOCK_UNAVAILABLE" | "ACTIVE_POPULATION";

export const POSITION_HISTORY_INGESTION_TELEMETRY_WINDOW_MS = 60_000;
export const POSITION_HISTORY_INGESTION_TELEMETRY_MAX_STARTS = 300;
export const POSITION_HISTORY_INGESTION_TELEMETRY_MAX_BLOCKED_KEYS = 5_000;

const realClock: PositionHistoryIngestionTelemetryClock = { now: (): Date => new Date() };

function copyDate(value: Date): Date {
  return new Date(value.getTime());
}

function nowMs(clock: PositionHistoryIngestionTelemetryClock): number {
  const value = clock.now();
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new Error("Invalid ingestion telemetry clock.");
  return value.getTime();
}

function storageLike(error: unknown): boolean {
  if ((typeof error !== "object" && typeof error !== "function") || error === null) return false;
  const record = error as Record<PropertyKey, unknown>;
  const name = typeof record.name === "string" ? record.name : "";
  if (name.includes("Prisma") || name.includes("Cursor") || name.includes("Replay") || name.includes("Persistence")) return true;
  const code = record.code;
  if (typeof code === "string" && /^P[0-9]+$/.test(code)) return true;
  return false;
}
export function classifyIngestionTelemetryFailure(error: unknown): PositionHistoryIngestionFailureCategory {
  const recorded = recordedPositionHistoryHistoricalWindowProviderFailure(error);
  if (recorded !== undefined) {
    if (recorded.category === "rate_limit") return "rate_limit";
    if (recorded.category === "http") return "provider_5xx";
    if (recorded.category === "permanent_http") return "provider_blocked";
    if (recorded.category === "network") return "network";
    if (recorded.category === "timeout") return "timeout";
    if (recorded.category === "contract") return "contract";
    return "unknown";
  }
  if (error instanceof EquGpsRateLimitError) return "rate_limit";
  if (error instanceof EquGpsHttpError && error.status !== undefined && error.status >= 500) return "provider_5xx";
  if (error instanceof EquGpsHttpError && error.status !== undefined && error.status >= 400 && error.status < 500) return "provider_blocked";
  if (error instanceof EquGpsNetworkError) return "network";
  if (error instanceof EquGpsTimeoutError) return "timeout";
  if (error instanceof EquGpsResponseValidationError || error instanceof PositionHistoryBackfillProviderContractError) return "contract";
  if (storageLike(error)) return "storage";
  return "unknown";
}

export type PositionHistoryIngestionTelemetrySnapshot = Readonly<{
  processStartedAt: Date;
  pollerStarted: boolean;
  cycleInFlight: boolean;
  lastCycleStartedAt: Date | null;
  lastCycleCompletedAt: Date | null;
  cyclesCompletedSinceProcessStart: number;
  lastCycleDurationMs: number | null;
  maxCycleDurationMsSinceProcessStart: number | null;
  cyclesExceedingPollIntervalSinceProcessStart: number;
  requestStartsLastMinute: number;
  requestStartsSinceProcessStart: number;
  retriesSinceProcessStart: number;
  rateLimitResponsesSinceProcessStart: number;
  provider5xxSinceProcessStart: number;
  networkFailuresSinceProcessStart: number;
  timeoutsSinceProcessStart: number;
  contractFailuresSinceProcessStart: number;
  storageFailuresSinceProcessStart: number;
  providerBlockedResponsesSinceProcessStart: number;
  unknownFailuresSinceProcessStart: number;
  historyLockContentionSinceProcessStart: number;
  providerBlockedStreams: number;
  recentTailSuccessesSinceProcessStart: number;
  recentTailFailuresSinceProcessStart: number;
  lastRecentTailSuccessAt: Date | null;
  lastSafeFailureCategory: PositionHistoryIngestionFailureCategory | null;
  lastSafeFailureAt: Date | null;
  retentionRunning: boolean;
  lastRetentionAttemptAt: Date | null;
  lastRetentionCompletedAt: Date | null;
  lastRetentionOutcome: PositionHistoryRetentionTelemetryOutcome;
  lastRetentionSkipCategory: PositionHistoryRetentionTelemetrySkipCategory | null;
}>;
@Injectable()
export class PositionHistoryIngestionTelemetryService {
  private readonly clock: PositionHistoryIngestionTelemetryClock;
  private readonly processStartedAt: Date;
  private pollerStarted = false;
  private cycleInFlight = false;
  private lastCycleStartedAt: Date | null = null;
  private lastCycleCompletedAt: Date | null = null;
  private cyclesCompleted = 0;
  private lastCycleDurationMs: number | null = null;
  private maxCycleDurationMs: number | null = null;
  private cyclesExceedingPollInterval = 0;
  private requestStarts: number[] = [];
  private requestStartsTotal = 0;
  private retriesTotal = 0;
  private rateLimitTotal = 0;
  private provider5xxTotal = 0;
  private networkTotal = 0;
  private timeoutTotal = 0;
  private contractTotal = 0;
  private storageTotal = 0;
  private providerBlockedResponsesTotal = 0;
  private unknownTotal = 0;
  private lockContentionTotal = 0;
  private recentSuccesses = 0;
  private recentFailures = 0;
  private lastRecentSuccessAt: Date | null = null;
  private readonly blockedUntil = new Map<string, number>();
  private lastFailureCategory: PositionHistoryIngestionFailureCategory | null = null;
  private lastFailureAt: Date | null = null;
  private retentionRunning = false;
  private lastRetentionAttemptAt: Date | null = null;
  private lastRetentionCompletedAt: Date | null = null;
  private lastRetentionOutcome: PositionHistoryRetentionTelemetryOutcome = "NOT_OBSERVED_THIS_PROCESS";
  private lastRetentionSkipCategory: PositionHistoryRetentionTelemetrySkipCategory | null = null;

  public constructor(@Optional() clock?: PositionHistoryIngestionTelemetryClock) {
    this.clock = clock ?? realClock;
    this.processStartedAt = new Date(nowMs(this.clock));
  }

  public markPollerStarted(): void {
    this.pollerStarted = true;
  }

  public isPollerStarted(): boolean {
    return this.pollerStarted;
  }

  public startCycle(at?: Date): void {
    const started = at instanceof Date ? new Date(at.getTime()) : new Date(nowMs(this.clock));
    if (!Number.isFinite(started.getTime())) throw new Error("Invalid ingestion telemetry cycle instant.");
    this.cycleInFlight = true;
    this.lastCycleStartedAt = started;
  }

  public completeCycle(at?: Date): void {
    const completed = at instanceof Date ? new Date(at.getTime()) : new Date(nowMs(this.clock));
    if (!Number.isFinite(completed.getTime())) throw new Error("Invalid ingestion telemetry cycle instant.");
    this.cycleInFlight = false;
    this.lastCycleCompletedAt = completed;
    if (this.lastCycleStartedAt !== null) {
      const durationMs = Math.max(0, completed.getTime() - this.lastCycleStartedAt.getTime());
      this.cyclesCompleted += 1;
      this.lastCycleDurationMs = durationMs;
      this.maxCycleDurationMs = Math.max(this.maxCycleDurationMs ?? 0, durationMs);
      if (durationMs > POSITION_HISTORY_CONTINUOUS_POLL_INTERVAL_MS) this.cyclesExceedingPollInterval += 1;
    }
  }

  public recordRequestStart(at?: Date): void {
    const instant = at instanceof Date ? at.getTime() : nowMs(this.clock);
    if (!Number.isFinite(instant)) throw new Error("Invalid ingestion telemetry request instant.");
    if (this.requestStarts.length >= POSITION_HISTORY_INGESTION_TELEMETRY_MAX_STARTS) this.requestStarts.shift();
    this.requestStarts.push(instant);
    this.requestStartsTotal += 1;
    this.pruneStarts(instant);
  }
  public recordProviderRetry(count = 1): void {
    if (!Number.isSafeInteger(count) || count < 0) throw new Error("Invalid ingestion telemetry retry count.");
    this.retriesTotal += count;
  }
  public recordRateLimitResponses(count = 1): void {
    if (!Number.isSafeInteger(count) || count < 0) throw new Error("Invalid ingestion telemetry rate-limit count.");
    this.rateLimitTotal += count;
  }

  public recordProviderFailure(error: unknown, at?: Date): PositionHistoryIngestionFailureCategory {
    const category = classifyIngestionTelemetryFailure(error);
    if (category === "rate_limit") this.rateLimitTotal += 1;
    else if (category === "provider_5xx") this.provider5xxTotal += 1;
    else if (category === "network") this.networkTotal += 1;
    else if (category === "timeout") this.timeoutTotal += 1;
    else if (category === "contract") this.contractTotal += 1;
    else if (category === "storage") this.storageTotal += 1;
    else if (category === "provider_blocked") this.providerBlockedResponsesTotal += 1;
    else this.unknownTotal += 1;
    const instant = at instanceof Date ? new Date(at.getTime()) : new Date(nowMs(this.clock));
    if (!Number.isFinite(instant.getTime())) throw new Error("Invalid ingestion telemetry failure instant.");
    this.lastFailureCategory = category;
    this.lastFailureAt = instant;
    return category;
  }

  public recordFailureCategory(category: PositionHistoryIngestionFailureCategory): void {
    if (category === "rate_limit") this.rateLimitTotal += 1;
    else if (category === "provider_5xx") this.provider5xxTotal += 1;
    else if (category === "network") this.networkTotal += 1;
    else if (category === "timeout") this.timeoutTotal += 1;
    else if (category === "contract") this.contractTotal += 1;
    else if (category === "storage") this.storageTotal += 1;
    else if (category === "provider_blocked") this.providerBlockedResponsesTotal += 1;
    else this.unknownTotal += 1;
    this.lastFailureCategory = category;
    this.lastFailureAt = new Date(nowMs(this.clock));
  }

  public recordLockContention(): void {
    this.lockContentionTotal += 1;
  }
  public startRetentionAttempt(at?: Date): void {
    const instant = at instanceof Date ? new Date(at.getTime()) : new Date(nowMs(this.clock));
    if (!Number.isFinite(instant.getTime())) throw new Error("Invalid ingestion telemetry retention instant.");
    this.retentionRunning = true;
    this.lastRetentionAttemptAt = instant;
  }
  public completeRetentionAttempt(outcome: PositionHistoryRetentionTelemetryOutcome, skipCategory?: PositionHistoryRetentionTelemetrySkipCategory | null, at?: Date): void {
    if (outcome !== "SUCCESS" && outcome !== "SKIPPED" && outcome !== "FAILED") throw new Error("Invalid ingestion telemetry retention outcome.");
    if (skipCategory !== undefined && skipCategory !== null && skipCategory !== "LOCK_UNAVAILABLE" && skipCategory !== "ACTIVE_POPULATION") throw new Error("Invalid ingestion telemetry retention skip category.");
    const instant = at instanceof Date ? new Date(at.getTime()) : new Date(nowMs(this.clock));
    if (!Number.isFinite(instant.getTime())) throw new Error("Invalid ingestion telemetry retention instant.");
    this.retentionRunning = false;
    this.lastRetentionCompletedAt = instant;
    this.lastRetentionOutcome = outcome;
    this.lastRetentionSkipCategory = outcome === "SKIPPED" && (skipCategory === "LOCK_UNAVAILABLE" || skipCategory === "ACTIVE_POPULATION") ? skipCategory : null;
  }

  public recordRecentTailSuccess(at?: Date): void {
    const instant = at instanceof Date ? new Date(at.getTime()) : new Date(nowMs(this.clock));
    if (!Number.isFinite(instant.getTime())) throw new Error("Invalid ingestion telemetry recent-tail instant.");
    this.recentSuccesses += 1;
    this.lastRecentSuccessAt = instant;
  }

  public recordRecentTailFailure(): void {
    this.recentFailures += 1;
  }

  public setProviderBlocked(key: string, blockedUntilMs: number): void {
    if (typeof key !== "string" || key.length === 0 || !Number.isFinite(blockedUntilMs)) throw new Error("Invalid ingestion telemetry blocked key.");
    if (!this.blockedUntil.has(key) && this.blockedUntil.size >= POSITION_HISTORY_INGESTION_TELEMETRY_MAX_BLOCKED_KEYS) {
      const oldest = this.blockedUntil.keys().next();
      if (!oldest.done) this.blockedUntil.delete(oldest.value);
    }
    this.blockedUntil.set(key, blockedUntilMs);
  }
  public getRequestStartsLastMinute(now?: Date): number {
    const nowMsValue = now instanceof Date ? now.getTime() : nowMs(this.clock);
    if (!Number.isFinite(nowMsValue)) throw new Error("Invalid ingestion telemetry clock.");
    this.pruneStarts(nowMsValue);
    let count = 0;
    const floor = nowMsValue - POSITION_HISTORY_INGESTION_TELEMETRY_WINDOW_MS;
    for (const started of this.requestStarts) if (started > floor && started <= nowMsValue) count += 1;
    return count;
  }

  public getProviderBlockedStreams(now?: Date): number {
    const nowMsValue = now instanceof Date ? now.getTime() : nowMs(this.clock);
    if (!Number.isFinite(nowMsValue)) throw new Error("Invalid ingestion telemetry clock.");
    let count = 0;
    for (const [key, until] of [...this.blockedUntil]) {
      if (!Number.isFinite(until) || until <= nowMsValue) this.blockedUntil.delete(key);
      else count += 1;
    }
    return count;
  }

  private pruneStarts(nowMsValue: number): void {
    const floor = nowMsValue - POSITION_HISTORY_INGESTION_TELEMETRY_WINDOW_MS;
    while (this.requestStarts.length > 0 && this.requestStarts[0]! <= floor) this.requestStarts.shift();
    while (this.requestStarts.length > POSITION_HISTORY_INGESTION_TELEMETRY_MAX_STARTS) this.requestStarts.shift();
  }

  public snapshot(now?: Date): PositionHistoryIngestionTelemetrySnapshot {
    const nowMsValue = now instanceof Date ? now.getTime() : nowMs(this.clock);
    if (!Number.isFinite(nowMsValue)) throw new Error("Invalid ingestion telemetry clock.");
    const requestStartsLastMinute = this.getRequestStartsLastMinute(new Date(nowMsValue));
    const providerBlockedStreams = this.getProviderBlockedStreams(new Date(nowMsValue));
    return Object.freeze({
      processStartedAt: copyDate(this.processStartedAt),
      pollerStarted: this.pollerStarted,
      cycleInFlight: this.cycleInFlight,
      lastCycleStartedAt: this.lastCycleStartedAt === null ? null : copyDate(this.lastCycleStartedAt),
      lastCycleCompletedAt: this.lastCycleCompletedAt === null ? null : copyDate(this.lastCycleCompletedAt),
      cyclesCompletedSinceProcessStart: this.cyclesCompleted,
      lastCycleDurationMs: this.lastCycleDurationMs,
      maxCycleDurationMsSinceProcessStart: this.maxCycleDurationMs,
      cyclesExceedingPollIntervalSinceProcessStart: this.cyclesExceedingPollInterval,
      requestStartsLastMinute,
      requestStartsSinceProcessStart: this.requestStartsTotal,
      retriesSinceProcessStart: this.retriesTotal,
      rateLimitResponsesSinceProcessStart: this.rateLimitTotal,
      provider5xxSinceProcessStart: this.provider5xxTotal,
      networkFailuresSinceProcessStart: this.networkTotal,
      timeoutsSinceProcessStart: this.timeoutTotal,
      contractFailuresSinceProcessStart: this.contractTotal,
      storageFailuresSinceProcessStart: this.storageTotal,
      providerBlockedResponsesSinceProcessStart: this.providerBlockedResponsesTotal,
      unknownFailuresSinceProcessStart: this.unknownTotal,
      historyLockContentionSinceProcessStart: this.lockContentionTotal,
      providerBlockedStreams,
      recentTailSuccessesSinceProcessStart: this.recentSuccesses,
      recentTailFailuresSinceProcessStart: this.recentFailures,
      lastRecentTailSuccessAt: this.lastRecentSuccessAt === null ? null : copyDate(this.lastRecentSuccessAt),
      lastSafeFailureCategory: this.lastFailureCategory,
      lastSafeFailureAt: this.lastFailureAt === null ? null : copyDate(this.lastFailureAt),
      retentionRunning: this.retentionRunning,
      lastRetentionAttemptAt: this.lastRetentionAttemptAt === null ? null : copyDate(this.lastRetentionAttemptAt),
      lastRetentionCompletedAt: this.lastRetentionCompletedAt === null ? null : copyDate(this.lastRetentionCompletedAt),
      lastRetentionOutcome: this.lastRetentionOutcome,
      lastRetentionSkipCategory: this.lastRetentionSkipCategory,
    });
  }
}
