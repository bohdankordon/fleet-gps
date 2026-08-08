import type { AlertNotificationDispatchBatchResult } from "../alert-notifications/alert-notification-dispatcher.service";

export type AlertNotificationSchedulerFailureCategory = "UNEXPECTED_DISPATCHER_FAILURE";

export type AlertNotificationSchedulerStatus = Readonly<{
  enabled: boolean;
  started: boolean;
  running: boolean;
  successfulRuns: number;
  failedRuns: number;
  skippedOverlaps: number;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastFailureCategory: AlertNotificationSchedulerFailureCategory | null;
  lastBatch: AlertNotificationDispatchBatchResult | null;
  dispatchIntervalMs: number;
  batchSize: number;
}>;

export class AlertNotificationSchedulerStateError extends Error {
  public constructor() {
    super("Alert notification scheduler state is invalid");
    this.name = "AlertNotificationSchedulerStateError";
  }
}

