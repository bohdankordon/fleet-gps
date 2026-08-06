export type SyncJobName = "fleet" | "runs";

export type SyncFailureCategory =
  | "equgps"
  | "database"
  | "configuration"
  | "unknown";

export type SyncJobStatus = Readonly<{
  running: boolean;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastFailureCategory: SyncFailureCategory | null;
  consecutiveFailures: number;
  successfulRuns: number;
  failedRuns: number;
  skippedOverlaps: number;
}>;

export type SyncSchedulerStatus = Readonly<{
  enabled: boolean;
  startedAt: string | null;
  fleetIntervalSeconds: number;
  runsIntervalSeconds: number;
  fleet: SyncJobStatus;
  runs: SyncJobStatus;
  generatedAt: string;
}>;

export class SyncSchedulerStateError extends Error {
  public constructor() {
    super("Invalid sync scheduler state.");
    this.name = "SyncSchedulerStateError";
  }
}
