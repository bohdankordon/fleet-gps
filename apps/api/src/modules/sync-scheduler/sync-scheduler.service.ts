import { Inject, Injectable, Optional, type OnApplicationBootstrap, type OnModuleDestroy } from "@nestjs/common";
import type { ApiConfig } from "../../config/api-config";
import { API_CONFIG } from "../../config/api-config.tokens";
import { DailyRunsSyncService } from "../dashboard/daily-runs-sync.service";
import { FleetSyncService } from "../fleet/fleet-sync.service";
import { classifySyncFailure } from "./sync-failure-classifier";
import type { Clock } from "./sync-scheduler-clock";
import { SCHEDULER_TIMER_ADAPTER, SYNC_SCHEDULER_CLOCK, SYNC_SCHEDULER_TIMEOUT_FACTORY } from "./sync-scheduler.tokens";
import { SyncSchedulerStatusService } from "./sync-scheduler-status.service";
import type { SchedulerTimerAdapter } from "./scheduler-timer.adapter";
import type { SyncJobName } from "./sync-scheduler.types";

const FLEET_INTERVAL_NAME = "taxi-gps:sync:fleet";
const RUNS_INTERVAL_NAME = "taxi-gps:sync:runs";

type ShutdownTimeout = Readonly<{
  promise: Promise<void>;
  clear(): void;
}>;

export type ShutdownTimeoutFactory = (milliseconds: number) => ShutdownTimeout;

export function createShutdownTimeout(milliseconds: number): ShutdownTimeout {
  let resolveTimeout: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    resolveTimeout = resolve;
  });
  const handle = setTimeout(resolveTimeout, milliseconds);
  handle.unref?.();

  return Object.freeze({
    promise,
    clear: () => clearTimeout(handle),
  });
}

@Injectable()
export class SyncSchedulerService implements OnApplicationBootstrap, OnModuleDestroy {
  private bootstrapAttempted = false;
  private shuttingDown = false;
  private ignoreCompletionsAfterShutdownTimeout = false;
  private fleetActive: Promise<void> | null = null;
  private runsActive: Promise<void> | null = null;
  private destroyPromise: Promise<void> | null = null;

  public constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly fleetSyncService: FleetSyncService,
    private readonly dailyRunsSyncService: DailyRunsSyncService,
    private readonly statusService: SyncSchedulerStatusService,
    @Inject(SYNC_SCHEDULER_CLOCK) private readonly clock: Clock,
    @Inject(SCHEDULER_TIMER_ADAPTER) private readonly timerAdapter: SchedulerTimerAdapter,
    @Optional() @Inject(SYNC_SCHEDULER_TIMEOUT_FACTORY) private readonly shutdownTimeoutFactory: ShutdownTimeoutFactory = createShutdownTimeout,
  ) {}

  public onApplicationBootstrap(): void {
    if (this.bootstrapAttempted || !this.config.syncScheduler.enabled) return;
    this.bootstrapAttempted = true;

    const startedAt = this.safeNow();
    if (startedAt === undefined) return;
    try {
      this.timerAdapter.addInterval(FLEET_INTERVAL_NAME, this.fleetCallback, this.config.syncScheduler.fleetIntervalSeconds * 1_000);
      try {
        this.timerAdapter.addInterval(RUNS_INTERVAL_NAME, this.runsCallback, this.config.syncScheduler.runsIntervalSeconds * 1_000);
        this.statusService.markSchedulerStarted(startedAt);
      } catch {
        this.deleteIntervalSafely(FLEET_INTERVAL_NAME);
      }
    } catch {
      return;
    }
  }

  public onModuleDestroy(): Promise<void> {
    if (this.destroyPromise !== null) return this.destroyPromise;
    this.destroyPromise = this.destroy();
    return this.destroyPromise;
  }

  private readonly fleetCallback = (): void => {
    void this.runJob("fleet").catch(() => undefined);
  };

  private readonly runsCallback = (): void => {
    void this.runJob("runs").catch(() => undefined);
  };

  private async runJob(job: SyncJobName): Promise<void> {
    if (this.shuttingDown) return;

    const startedAt = this.safeNow();
    if (startedAt === undefined || !this.statusService.tryStart(job, startedAt)) return;

    let operation: Promise<unknown>;
    try {
      operation = Promise.resolve(job === "fleet" ? this.fleetSyncService.syncLatestSnapshot() : this.dailyRunsSyncService.syncCurrentDayRuns());
    } catch (error) {
      this.completeFailure(job, error);
      return;
    }

    const execution = operation.then(
      () => this.completeSuccess(job),
      (error: unknown) => this.completeFailure(job, error),
    ).finally(() => {
      if (this.activeFor(job) === execution) this.setActive(job, null);
    });
    this.setActive(job, execution);
    await execution;
  }

  private completeSuccess(job: SyncJobName): void {
    if (this.ignoreCompletionsAfterShutdownTimeout) return;
    const completedAt = this.safeNow();
    if (completedAt === undefined) {
      this.statusService.clearRunning(job);
      return;
    }
    this.statusService.markSuccess(job, completedAt);
  }

  private completeFailure(job: SyncJobName, error: unknown): void {
    if (this.ignoreCompletionsAfterShutdownTimeout) return;
    const completedAt = this.safeNow();
    if (completedAt === undefined) {
      this.statusService.clearRunning(job);
      return;
    }

    this.statusService.markFailure(job, completedAt, classifySyncFailure(error));
  }

  private async destroy(): Promise<void> {
    this.shuttingDown = true;
    this.deleteIntervalSafely(FLEET_INTERVAL_NAME);
    this.deleteIntervalSafely(RUNS_INTERVAL_NAME);

    const activeJobs = [this.fleetActive, this.runsActive].filter((job): job is Promise<void> => job !== null);
    if (activeJobs.length > 0) {
      const timeout = this.shutdownTimeoutFactory(this.config.syncScheduler.shutdownTimeoutMs);
      let timedOut = false;
      try {
        await Promise.race([
          Promise.allSettled(activeJobs),
          timeout.promise.then(() => { timedOut = true; }),
        ]);
      } catch {
        timedOut = true;
      } finally {
        timeout.clear();
      }
      if (timedOut) this.ignoreCompletionsAfterShutdownTimeout = true;
    }

    this.statusService.resetRunningAfterShutdown();
  }

  private safeNow(): Date | undefined {
    try {
      const current = this.clock.now();
      const milliseconds = current.getTime();
      return Number.isFinite(milliseconds) ? new Date(milliseconds) : undefined;
    } catch {
      return undefined;
    }
  }

  private activeFor(job: SyncJobName): Promise<void> | null {
    return job === "fleet" ? this.fleetActive : this.runsActive;
  }

  private setActive(job: SyncJobName, active: Promise<void> | null): void {
    if (job === "fleet") this.fleetActive = active;
    else this.runsActive = active;
  }

  private deleteIntervalSafely(name: string): void {
    try {
      this.timerAdapter.deleteInterval(name);
    } catch {
      return;
    }
  }
}
