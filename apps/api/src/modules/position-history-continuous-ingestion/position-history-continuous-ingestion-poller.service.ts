import { Inject, Injectable, Logger, Optional, type OnApplicationBootstrap, type OnModuleDestroy } from "@nestjs/common";
import type { ApiConfig } from "../../config/api-config";
import { API_CONFIG } from "../../config/api-config.tokens";
import { POSITION_HISTORY_CONTINUOUS_POLL_INTERVAL_MS } from "./position-history-continuous-ingestion.constants";
import { PositionHistoryContinuousIngestionStatusService } from "./position-history-continuous-ingestion-status.service";
import { POSITION_HISTORY_CONTINUOUS_TIMER } from "./position-history-continuous-ingestion.tokens";
import type { PositionHistoryContinuousStatus, PositionHistoryContinuousTimer } from "./position-history-continuous-ingestion.types";
import { PositionHistoryWorkloadCoordinatorService } from "./position-history-workload-coordinator.service";
import type { PositionHistoryIngestionTelemetryService } from "../position-history-horizon-execution/position-history-ingestion-telemetry.service";

export const POSITION_HISTORY_CONTINUOUS_STARTUP_TIMER = "taxi-gps:position-history-continuous:startup";
export const POSITION_HISTORY_CONTINUOUS_POLL_TIMER = "taxi-gps:position-history-continuous:poll";

@Injectable()
export class PositionHistoryContinuousIngestionPollerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(PositionHistoryContinuousIngestionPollerService.name);
  private started = false;
  private shuttingDown = false;
  private active: Promise<void> | null = null;

  public constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly worker: PositionHistoryWorkloadCoordinatorService,
    private readonly status: PositionHistoryContinuousIngestionStatusService,
    @Inject(POSITION_HISTORY_CONTINUOUS_TIMER) private readonly timer: PositionHistoryContinuousTimer,
    @Optional() private readonly telemetry?: PositionHistoryIngestionTelemetryService,
  ) {}

  public onApplicationBootstrap(): void {
    if (this.started || this.config.positionHistoryContinuousIngestion?.enabled !== true) return;
    this.started = true;
    this.telemetry?.markPollerStarted();
    try {
      this.timer.addTimeout(POSITION_HISTORY_CONTINUOUS_STARTUP_TIMER, this.callback, 0);
      try { this.timer.addInterval(POSITION_HISTORY_CONTINUOUS_POLL_TIMER, this.callback, POSITION_HISTORY_CONTINUOUS_POLL_INTERVAL_MS); }
      catch { this.timer.deleteTimeout(POSITION_HISTORY_CONTINUOUS_STARTUP_TIMER); }
    } catch { return; }
  }

  public async poll(): Promise<void> {
    if (this.shuttingDown || this.active !== null || !this.status.start()) return;
    this.telemetry?.startCycle();
    const execution = Promise.resolve().then(() => this.worker.processCycle()).then(
      (result) => { this.status.complete(result); this.logger.log("Continuous position-history cycle completed safely.", { laneWork: result.recentTailCompleted + result.backlogCompleted, requests: result.requests, inserted: result.inserted, duplicates: result.duplicates, invalid: result.invalid, retries: result.retries, rateLimitResponses: result.rateLimitResponses, cursorAdvancements: result.cursorAdvancements, providerBlocked: result.providerBlocked, failedWork: result.failedWork, lockUnavailable: result.lockUnavailable }); },
      () => { this.status.fail(); this.logger.error("Continuous position-history cycle failed safely."); },
    ).finally(() => { this.telemetry?.completeCycle(); if (this.active === execution) this.active = null; });
    this.active = execution;
    await execution;
  }

  public getStatus(): PositionHistoryContinuousStatus {
    return this.status.snapshot(this.config.positionHistoryContinuousIngestion?.enabled === true);
  }
  public isStarted(): boolean {
    return this.started;
  }

  public async onModuleDestroy(): Promise<void> {
    this.shuttingDown = true;
    this.timer.deleteTimeout(POSITION_HISTORY_CONTINUOUS_STARTUP_TIMER);
    this.timer.deleteInterval(POSITION_HISTORY_CONTINUOUS_POLL_TIMER);
    if (this.active !== null) await this.active;
  }

  private readonly callback = (): void => { void this.poll(); };
}
