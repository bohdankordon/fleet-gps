import { Injectable } from "@nestjs/common";
import type { AlertNotificationDispatchBatchResult } from "../alert-notifications/alert-notification-dispatcher.service";
import {
  AlertNotificationSchedulerStateError,
  type AlertNotificationSchedulerFailureCategory,
  type AlertNotificationSchedulerStatus,
} from "./alert-notification-scheduler.types";

type SchedulerSnapshotConfig = Readonly<{
  enabled: boolean;
  dispatchIntervalMs: number;
  batchSize: number;
}>;

function toIsoTimestamp(at: Date): string {
  let timestamp: number;
  try {
    timestamp = at.getTime();
  } catch {
    throw new AlertNotificationSchedulerStateError();
  }
  if (!Number.isFinite(timestamp)) throw new AlertNotificationSchedulerStateError();
  try {
    return new Date(timestamp).toISOString();
  } catch {
    throw new AlertNotificationSchedulerStateError();
  }
}

function copyBatch(result: AlertNotificationDispatchBatchResult): AlertNotificationDispatchBatchResult {
  return Object.freeze({
    claimed: result.claimed,
    sent: result.sent,
    retryScheduled: result.retryScheduled,
    failedPermanent: result.failedPermanent,
    lostLease: result.lostLease,
  });
}

@Injectable()
export class AlertNotificationSchedulerStatusService {
  private started = false;
  private running = false;
  private successfulRuns = 0;
  private failedRuns = 0;
  private skippedOverlaps = 0;
  private lastStartedAt: string | null = null;
  private lastFinishedAt: string | null = null;
  private lastSuccessAt: string | null = null;
  private lastFailureAt: string | null = null;
  private lastFailureCategory: AlertNotificationSchedulerFailureCategory | null = null;
  private lastBatch: AlertNotificationDispatchBatchResult | null = null;

  public markSchedulerStarted(): void {
    this.started = true;
  }

  public tryStart(at: Date): boolean {
    if (this.running) {
      this.skippedOverlaps += 1;
      return false;
    }
    this.running = true;
    this.lastStartedAt = toIsoTimestamp(at);
    return true;
  }

  public markSuccess(at: Date, result: AlertNotificationDispatchBatchResult): void {
    const timestamp = toIsoTimestamp(at);
    this.running = false;
    this.lastFinishedAt = timestamp;
    this.lastSuccessAt = timestamp;
    this.lastFailureCategory = null;
    this.lastBatch = copyBatch(result);
    this.successfulRuns += 1;
  }

  public markFailure(at: Date, category: AlertNotificationSchedulerFailureCategory): void {
    const timestamp = toIsoTimestamp(at);
    this.running = false;
    this.lastFinishedAt = timestamp;
    this.lastFailureAt = timestamp;
    this.lastFailureCategory = category;
    this.failedRuns += 1;
  }

  public markSchedulerStopped(): void {
    this.started = false;
  }

  public clearRunning(): void {
    this.running = false;
  }

  public snapshot(config: SchedulerSnapshotConfig): AlertNotificationSchedulerStatus {
    return Object.freeze({
      enabled: config.enabled,
      started: this.started,
      running: this.running,
      successfulRuns: this.successfulRuns,
      failedRuns: this.failedRuns,
      skippedOverlaps: this.skippedOverlaps,
      lastStartedAt: this.lastStartedAt,
      lastFinishedAt: this.lastFinishedAt,
      lastSuccessAt: this.lastSuccessAt,
      lastFailureAt: this.lastFailureAt,
      lastFailureCategory: this.lastFailureCategory,
      lastBatch: this.lastBatch === null ? null : copyBatch(this.lastBatch),
      dispatchIntervalMs: config.dispatchIntervalMs,
      batchSize: config.batchSize,
    });
  }
}

