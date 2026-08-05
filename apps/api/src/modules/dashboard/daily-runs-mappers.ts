import type { DailyRun } from "@taxi-gps/equgps";
import { DailyRunsValidationError, type DailyRunSnapshot } from "./dashboard.types";

export function normalizeDailyRuns(runs: readonly DailyRun[]): Readonly<{ runs: readonly DailyRunSnapshot[]; duplicateRuns: number }> {
  const selected = new Map<number, DailyRunSnapshot>();
  let duplicateRuns = 0;
  for (const run of runs) {
    if (!Number.isInteger(run.deviceId) || run.deviceId <= 0 || !Number.isFinite(run.distanceMeters) || run.distanceMeters < 0) throw new DailyRunsValidationError();
    if (selected.has(run.deviceId)) duplicateRuns += 1;
    selected.set(run.deviceId, { externalDeviceId: run.deviceId, distanceMeters: run.distanceMeters });
  }
  return { runs: [...selected.values()], duplicateRuns };
}
