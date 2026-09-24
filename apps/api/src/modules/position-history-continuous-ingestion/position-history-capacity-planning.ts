import { POSITION_HISTORY_CONTINUOUS_POLL_INTERVAL_MS } from "./position-history-continuous-ingestion.constants";
import { POSITION_HISTORY_CAPACITY_DAILY_STARTS_PER_MINUTE, POSITION_HISTORY_CAPACITY_OVERDUE_DAILY_STARTS_PER_MINUTE, POSITION_HISTORY_CAPACITY_OVERDUE_ROLLING_STARTS_PER_MINUTE, POSITION_HISTORY_CAPACITY_RECENT_STARTS_PER_MINUTE, POSITION_HISTORY_CAPACITY_ROLLING_STARTS_PER_MINUTE, POSITION_HISTORY_COORDINATED_REQUEST_START_BUDGET } from "./position-history-replay-orchestration.constants";
import type { PositionHistoryReplayPressure } from "./position-history-replay-orchestration.types";

export type PositionHistoryCapacityLane = "RECENT_TAIL" | "CONTIGUOUS_BACKLOG" | "DAILY_7_DAY" | "ROLLING_90_DAY";

export type PositionHistoryCapacityPressure = Readonly<{
  daily: PositionHistoryReplayPressure;
  rolling: PositionHistoryReplayPressure;
}>;

export const POSITION_HISTORY_CAPACITY_MAX_ACCRUAL_MS = 60_000;

export function positionHistoryCapacityElapsedMinutes(lastPlanAtMs: number | null, atMs: number): number {
  if (!Number.isFinite(atMs) || (lastPlanAtMs !== null && !Number.isFinite(lastPlanAtMs))) throw new Error("Invalid history capacity planning instant.");
  return (lastPlanAtMs === null
    ? POSITION_HISTORY_CONTINUOUS_POLL_INTERVAL_MS
    : Math.min(POSITION_HISTORY_CAPACITY_MAX_ACCRUAL_MS, Math.max(0, atMs - lastPlanAtMs))) / 60_000;
}

/** Small process-local deficit allocator; all correctness/progress remains durable. */
export class PositionHistoryCapacityAllocator {
  private recentDeficit = 0;
  private dailyDeficit = 0;
  private rollingDeficit = 0;
  private lastPlanAtMs: number | null = null;

  public plan(pressure: PositionHistoryCapacityPressure, atMs: number): readonly PositionHistoryCapacityLane[] {
    // The first plan receives one nominal tick. Later plans credit elapsed time,
    // capped so a paused process cannot turn missed time into a large burst.
    const elapsedMinutes = positionHistoryCapacityElapsedMinutes(this.lastPlanAtMs, atMs);
    this.lastPlanAtMs = atMs;
    this.recentDeficit += POSITION_HISTORY_CAPACITY_RECENT_STARTS_PER_MINUTE * elapsedMinutes;
    const dailyRate = pressure.daily.overdue ? POSITION_HISTORY_CAPACITY_OVERDUE_DAILY_STARTS_PER_MINUTE : POSITION_HISTORY_CAPACITY_DAILY_STARTS_PER_MINUTE;
    const rollingRate = pressure.rolling.overdue ? POSITION_HISTORY_CAPACITY_OVERDUE_ROLLING_STARTS_PER_MINUTE : POSITION_HISTORY_CAPACITY_ROLLING_STARTS_PER_MINUTE;
    this.dailyDeficit = pressure.daily.due ? this.dailyDeficit + dailyRate * elapsedMinutes : 0;
    this.rollingDeficit = pressure.rolling.due ? this.rollingDeficit + rollingRate * elapsedMinutes : 0;

    const lanes: PositionHistoryCapacityLane[] = [];
    for (let slot = 0; slot < POSITION_HISTORY_COORDINATED_REQUEST_START_BUDGET; slot += 1) {
      const candidates = [
        { lane: "RECENT_TAIL" as const, deficit: this.recentDeficit, overdue: false, order: 0 },
        ...(pressure.daily.due ? [{ lane: "DAILY_7_DAY" as const, deficit: this.dailyDeficit, overdue: pressure.daily.overdue, order: 1 }] : []),
        ...(pressure.rolling.due ? [{ lane: "ROLLING_90_DAY" as const, deficit: this.rollingDeficit, overdue: pressure.rolling.overdue, order: 2 }] : []),
      ].filter(({ deficit }) => deficit > 0)
        .sort((left, right) => (right.deficit + (right.overdue ? 0.5 : 0)) - (left.deficit + (left.overdue ? 0.5 : 0)) || left.order - right.order);
      const selected = candidates[0];
      if (selected === undefined) {
        lanes.push("CONTIGUOUS_BACKLOG");
        continue;
      }
      lanes.push(selected.lane);
      if (selected.lane === "RECENT_TAIL") this.recentDeficit -= 1;
      else if (selected.lane === "DAILY_7_DAY") this.dailyDeficit -= 1;
      else this.rollingDeficit -= 1;
    }
    return Object.freeze(lanes);
  }
}

export type PositionHistoryInitialBacklogCapacityModel = Readonly<{
  vehicles: number;
  requests: number;
  fullBudgetMinutes: number;
  reservedCapacityMinutes: number;
}>;

export function positionHistoryInitialBacklogCapacityModel(vehicles: number, steadyStateStartsPerMinute: number): PositionHistoryInitialBacklogCapacityModel {
  if (!Number.isSafeInteger(vehicles) || vehicles < 1 || !Number.isFinite(steadyStateStartsPerMinute) || steadyStateStartsPerMinute < 0 || steadyStateStartsPerMinute >= 30) throw new Error("Invalid history capacity model input.");
  const progressMinutes = 5 * 60 + 45;
  const requests = vehicles * Math.ceil(90 * 24 * 60 / progressMinutes);
  return Object.freeze({ vehicles, requests, fullBudgetMinutes: requests / 30, reservedCapacityMinutes: requests / (30 - steadyStateStartsPerMinute) });
}
