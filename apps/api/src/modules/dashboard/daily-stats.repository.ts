import type { DailyRunsPersistenceResult, DailyRunsSnapshot } from "./dashboard.types";

export interface DailyStatsRepository {
  getTimezone(): Promise<string>;
  persistRunsSnapshot(snapshot: DailyRunsSnapshot): Promise<DailyRunsPersistenceResult>;
}
