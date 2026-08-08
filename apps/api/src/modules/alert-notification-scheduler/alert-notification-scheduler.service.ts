import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import type { ApiConfig } from "../../config/api-config";
import { API_CONFIG } from "../../config/api-config.tokens";
import { AlertNotificationDispatcherService, type AlertNotificationDispatchBatchResult } from "../alert-notifications/alert-notification-dispatcher.service";
import type { SchedulerTimerAdapter } from "../sync-scheduler/scheduler-timer.adapter";
import type { Clock } from "../sync-scheduler/sync-scheduler-clock";
import { AlertNotificationSchedulerStatusService } from "./alert-notification-scheduler-status.service";
import { ALERT_NOTIFICATION_SCHEDULER_CLOCK, ALERT_NOTIFICATION_SCHEDULER_TIMER } from "./alert-notification-scheduler.tokens";
import type { AlertNotificationSchedulerStatus } from "./alert-notification-scheduler.types";

export const ALERT_NOTIFICATION_DISPATCH_INTERVAL_NAME = "taxi-gps:notifications:telegram";

@Injectable()
export class AlertNotificationSchedulerService implements OnModuleInit, OnModuleDestroy {
  private initialized = false;
  private shuttingDown = false;
  private active: Promise<void> | null = null;
  private activeController: AbortController | null = null;
  private destroyPromise: Promise<void> | null = null;

  public constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly dispatcher: AlertNotificationDispatcherService,
    private readonly statusService: AlertNotificationSchedulerStatusService,
    @Inject(ALERT_NOTIFICATION_SCHEDULER_CLOCK) private readonly clock: Clock,
    @Inject(ALERT_NOTIFICATION_SCHEDULER_TIMER) private readonly timerAdapter: SchedulerTimerAdapter,
  ) {}

  public onModuleInit(): void {
    if (this.initialized) return;
    this.initialized = true;
    if (!this.config.telegramNotifications.enabled) return;

    try {
      this.timerAdapter.addInterval(
        ALERT_NOTIFICATION_DISPATCH_INTERVAL_NAME,
        this.timerCallback,
        this.config.telegramNotifications.dispatchIntervalMs,
      );
      this.statusService.markSchedulerStarted();
    } catch {
      this.deleteIntervalSafely();
    }
  }

  public onModuleDestroy(): Promise<void> {
    if (this.destroyPromise !== null) return this.destroyPromise;
    this.destroyPromise = this.destroy();
    return this.destroyPromise;
  }

  public getStatus(): AlertNotificationSchedulerStatus {
    return this.statusService.snapshot(this.config.telegramNotifications);
  }

  private readonly timerCallback = (): void => {
    void this.runCycle().catch(() => undefined);
  };

  private async runCycle(): Promise<void> {
    if (this.shuttingDown) return;
    const startedAt = this.safeNow();
    if (startedAt === undefined || !this.statusService.tryStart(startedAt)) return;
    const controller = new AbortController();
    this.activeController = controller;

    let operation: Promise<AlertNotificationDispatchBatchResult>;
    try {
      operation = Promise.resolve(this.dispatcher.dispatchBatch(this.config.telegramNotifications.batchSize, controller.signal));
    } catch {
      if (this.activeController === controller) this.activeController = null;
      this.completeFailure();
      return;
    }

    const execution = operation.then(
      (result) => this.completeSuccess(result),
      () => this.completeFailure(),
    ).finally(() => {
      if (this.active === execution) this.active = null;
      if (this.activeController === controller) this.activeController = null;
    });
    this.active = execution;
    await execution;
  }

  private completeSuccess(result: AlertNotificationDispatchBatchResult): void {
    const finishedAt = this.safeNow();
    if (finishedAt === undefined) {
      this.statusService.clearRunning();
      return;
    }
    this.statusService.markSuccess(finishedAt, result);
  }

  private completeFailure(): void {
    const finishedAt = this.safeNow();
    if (finishedAt === undefined) {
      this.statusService.clearRunning();
      return;
    }
    this.statusService.markFailure(finishedAt, "UNEXPECTED_DISPATCHER_FAILURE");
  }

  private async destroy(): Promise<void> {
    this.shuttingDown = true;
    this.deleteIntervalSafely();
    this.statusService.markSchedulerStopped();
    this.activeController?.abort();
    const active = this.active;
    if (active !== null) await active;
    this.statusService.clearRunning();
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

  private deleteIntervalSafely(): void {
    try {
      this.timerAdapter.deleteInterval(ALERT_NOTIFICATION_DISPATCH_INTERVAL_NAME);
    } catch {
      return;
    }
  }
}
