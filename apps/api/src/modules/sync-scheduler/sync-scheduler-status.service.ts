import { Injectable } from "@nestjs/common";
import {
  SyncSchedulerStateError,
  type SyncFailureCategory,
  type SyncJobName,
  type SyncJobStatus,
  type SyncSchedulerStatus,
} from "./sync-scheduler.types";

type SchedulerSnapshotConfig = Readonly<{
  enabled: boolean;
  fleetIntervalSeconds: number;
  runsIntervalSeconds: number;
}>;

type MutableSyncJobStatus = {
  running: boolean;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastFailureCategory: SyncFailureCategory | null;
  consecutiveFailures: number;
  successfulRuns: number;
  failedRuns: number;
  skippedOverlaps: number;
};

function initialJobStatus(): MutableSyncJobStatus {
  return {
    running: false,
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastFailureCategory: null,
    consecutiveFailures: 0,
    successfulRuns: 0,
    failedRuns: 0,
    skippedOverlaps: 0,
  };
}

function toIsoTimestamp(at: Date): string {
  let timestamp: number;

  try {
    timestamp = at.getTime();
  } catch {
    throw new SyncSchedulerStateError();
  }

  if (!Number.isFinite(timestamp)) throw new SyncSchedulerStateError();

  try {
    return new Date(timestamp).toISOString();
  } catch {
    throw new SyncSchedulerStateError();
  }
}

function copyJobStatus(status: MutableSyncJobStatus): SyncJobStatus {
  return Object.freeze({ ...status });
}

@Injectable()
export class SyncSchedulerStatusService {
  private startedAt: string | null = null;
  private readonly fleet = initialJobStatus();
  private readonly runs = initialJobStatus();

  public markSchedulerStarted(at: Date): void {
    const timestamp = toIsoTimestamp(at);
    if (this.startedAt === null) this.startedAt = timestamp;
  }

  public tryStart(job: SyncJobName, at: Date): boolean {
    const status = this.statusFor(job);
    if (status.running) {
      status.skippedOverlaps += 1;
      return false;
    }

    status.running = true;
    status.lastAttemptAt = toIsoTimestamp(at);
    return true;
  }

  public markSuccess(job: SyncJobName, at: Date): void {
    const status = this.statusFor(job);
    status.running = false;
    status.lastSuccessAt = toIsoTimestamp(at);
    status.successfulRuns += 1;
    status.consecutiveFailures = 0;
  }

  public markFailure(job: SyncJobName, at: Date, category: SyncFailureCategory): void {
    const status = this.statusFor(job);
    status.running = false;
    status.lastFailureAt = toIsoTimestamp(at);
    status.lastFailureCategory = category;
    status.failedRuns += 1;
    status.consecutiveFailures += 1;
  }

  public snapshot(config: SchedulerSnapshotConfig, generatedAt: Date): SyncSchedulerStatus {
    const timestamp = toIsoTimestamp(generatedAt);
    return Object.freeze({
      enabled: config.enabled,
      startedAt: this.startedAt,
      fleetIntervalSeconds: config.fleetIntervalSeconds,
      runsIntervalSeconds: config.runsIntervalSeconds,
      fleet: copyJobStatus(this.fleet),
      runs: copyJobStatus(this.runs),
      generatedAt: timestamp,
    });
  }

  public resetRunningAfterShutdown(): void {
    this.fleet.running = false;
    this.runs.running = false;
  }

  public clearRunning(job: SyncJobName): void {
    this.statusFor(job).running = false;
  }

  private statusFor(job: SyncJobName): MutableSyncJobStatus {
    return job === "fleet" ? this.fleet : this.runs;
  }
}
