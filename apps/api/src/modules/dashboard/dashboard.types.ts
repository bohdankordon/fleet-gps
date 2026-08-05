export type DashboardClock = { now(): Date };

export type DailyRunSnapshot = Readonly<{ externalDeviceId: number; distanceMeters: number }>;

export type DailyRunsSnapshot = Readonly<{
  serviceDate: string;
  fetchedAt: Date;
  runs: readonly DailyRunSnapshot[];
}>;

export type DailyRunsPersistenceResult = Readonly<{
  dailyStatsUpserted: number;
  vehiclesWithoutRun: number;
  unmatchedRuns: number;
  protectedExactStats: number;
}>;

export type DailyRunsSyncResult = Readonly<{
  runsReceived: number;
  uniqueRuns: number;
  dailyStatsUpserted: number;
  vehiclesWithoutRun: number;
  unmatchedRuns: number;
  duplicateRuns: number;
  protectedExactStats: number;
  serviceDate: string;
  fetchedAt: string;
}>;

export class DailyRunsConfigurationError extends Error {
  public constructor() { super("Invalid dashboard configuration."); this.name = "DailyRunsConfigurationError"; }
}

export class DailyRunsValidationError extends Error {
  public constructor() { super("Invalid daily runs snapshot."); this.name = "DailyRunsValidationError"; }
}
