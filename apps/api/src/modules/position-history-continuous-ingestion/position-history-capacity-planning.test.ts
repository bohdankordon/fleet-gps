import assert from "node:assert/strict";
import test from "node:test";
import { POSITION_HISTORY_CONTINUOUS_POLL_INTERVAL_MS, POSITION_HISTORY_CONTINUOUS_REQUEST_START_GAP_MS } from "./position-history-continuous-ingestion.constants";
import { POSITION_HISTORY_CAPACITY_MAX_ACCRUAL_MS, PositionHistoryCapacityAllocator, positionHistoryCapacityElapsedMinutes, positionHistoryInitialBacklogCapacityModel } from "./position-history-capacity-planning";
import { POSITION_HISTORY_COORDINATED_REQUEST_START_BUDGET } from "./position-history-replay-orchestration.constants";

type Simulation = Readonly<{
  starts: number;
  maxStartsInMinute: number;
  minimumGapMs: number;
  recentDemand: number;
  recentCompleted: number;
  dailyCompleted: number;
  rollingCompleted: number;
  backlogCompleted: number;
  dailyRemainingAtDeadlines: readonly number[];
  rollingRemaining: number;
}>;

function simulate(vehicles: number, days: number, resetAtDay: number | null = null): Simulation {
  let allocator = new PositionHistoryCapacityAllocator();
  let recentDemand = 0;
  let recentQueue = 0;
  let recentCompleted = 0;
  let dailyQueue = vehicles * 28;
  let dailyCompleted = 0;
  let rollingQueue = vehicles * 360;
  let rollingCompleted = 0;
  let backlogCompleted = 0;
  let previousStart = Number.NEGATIVE_INFINITY;
  let minimumGapMs = Number.POSITIVE_INFINITY;
  let maxStartsInMinute = 0;
  const recentStarts: number[] = [];
  let recentStartIndex = 0;
  const dailyRemainingAtDeadlines: number[] = [];
  const dayMs = 24 * 60 * 60 * 1_000;
  const totalMs = days * 24 * 60 * 60 * 1_000;
  let nextDailyDeadline = dayMs;
  let resetDone = false;

  for (let cycleAt = 0; cycleAt < totalMs; cycleAt += POSITION_HISTORY_CONTINUOUS_POLL_INTERVAL_MS) {
    if (resetAtDay !== null && !resetDone && cycleAt >= resetAtDay * dayMs) { allocator = new PositionHistoryCapacityAllocator(); resetDone = true; }
    while (cycleAt >= nextDailyDeadline) {
      dailyRemainingAtDeadlines.push(dailyQueue);
      dailyQueue += vehicles * 28;
      nextDailyDeadline += dayMs;
    }
    const recentArrival = vehicles * POSITION_HISTORY_CONTINUOUS_POLL_INTERVAL_MS / (5 * 60_000);
    recentDemand += recentArrival;
    recentQueue += recentArrival;
    const plan = allocator.plan({ daily: { due: dailyQueue >= 1, overdue: false }, rolling: { due: rollingQueue >= 1, overdue: false } }, cycleAt);
    assert.equal(plan.length, POSITION_HISTORY_COORDINATED_REQUEST_START_BUDGET);
    for (let slot = 0; slot < plan.length; slot += 1) {
      const startedAt = cycleAt + slot * POSITION_HISTORY_CONTINUOUS_REQUEST_START_GAP_MS;
      minimumGapMs = Math.min(minimumGapMs, startedAt - previousStart);
      previousStart = startedAt;
      recentStarts.push(startedAt);
      while (recentStarts[recentStartIndex]! <= startedAt - 60_000) recentStartIndex += 1;
      maxStartsInMinute = Math.max(maxStartsInMinute, recentStarts.length - recentStartIndex);

      const lane = plan[slot]!;
      if (lane === "RECENT_TAIL" && recentQueue >= 1) { recentQueue -= 1; recentCompleted += 1; }
      else if (lane === "DAILY_7_DAY" && dailyQueue >= 1) { dailyQueue -= 1; dailyCompleted += 1; }
      else if (lane === "ROLLING_90_DAY" && rollingQueue >= 1) { rollingQueue -= 1; rollingCompleted += 1; }
      else backlogCompleted += 1;
    }
  }
  dailyRemainingAtDeadlines.push(dailyQueue);
  return { starts: recentStarts.length, maxStartsInMinute, minimumGapMs, recentDemand, recentCompleted, dailyCompleted, rollingCompleted, backlogCompleted, dailyRemainingAtDeadlines, rollingRemaining: rollingQueue };
}

for (const vehicles of [50, 58, 100]) {
  test(`${vehicles}-vehicle idealized capacity keeps safety fences and meets recent/daily/rolling service goals`, () => {
    const result = simulate(vehicles, 7);
    assert.ok(result.maxStartsInMinute <= 30);
    assert.ok(result.minimumGapMs >= 2_000);
    assert.ok(result.recentCompleted >= Math.floor(result.recentDemand) - 1);
    assert.ok(result.dailyRemainingAtDeadlines.every((remaining) => remaining < 1));
    assert.ok(result.rollingRemaining < 1);
    assert.ok(result.backlogCompleted > 2 * 7 * 24 * 60);
    assert.equal(result.starts, Math.ceil(7 * 24 * 60 * 60 * 1_000 / POSITION_HISTORY_CONTINUOUS_POLL_INTERVAL_MS) * POSITION_HISTORY_COORDINATED_REQUEST_START_BUDGET);
  });
}

test("process-local allocator reset changes only ordering; durable outstanding work still completes", () => {
  const uninterrupted = simulate(100, 7);
  const restarted = simulate(100, 7, 3);
  assert.ok(uninterrupted.rollingRemaining < 1);
  assert.ok(restarted.rollingRemaining < 1);
  assert.ok(restarted.dailyRemainingAtDeadlines.every((remaining) => remaining < 1));
});

test("overdue replay accrues extra deterministic service without adding request slots", () => {
  const count = (overdue: boolean) => {
    const allocator = new PositionHistoryCapacityAllocator();
    const totals = { daily: 0, rolling: 0 };
    for (let cycle = 0; cycle < 400; cycle += 1) {
      const plan = allocator.plan({ daily: { due: true, overdue }, rolling: { due: true, overdue } }, cycle * POSITION_HISTORY_CONTINUOUS_POLL_INTERVAL_MS);
      assert.equal(plan.length, 5);
      totals.daily += plan.filter((lane) => lane === "DAILY_7_DAY").length;
      totals.rolling += plan.filter((lane) => lane === "ROLLING_90_DAY").length;
    }
    return totals;
  };
  const normal = count(false);
  const overdue = count(true);
  assert.ok(overdue.daily > normal.daily);
  assert.ok(overdue.rolling > normal.rolling);
});

test("irregular plans credit actual elapsed time while five slots remain the physical ceiling", () => {
  for (const interval of [10_500, 20_000, 30_000, 60_000]) {
    assert.equal(positionHistoryCapacityElapsedMinutes(1_000, 1_000 + interval), interval / 60_000);
    const allocator = new PositionHistoryCapacityAllocator();
    const totals = { recent: 0, daily: 0, rolling: 0, backlog: 0 };
    const cycles = Math.ceil(10 * 60_000 / interval);
    for (let cycle = 0; cycle < cycles; cycle += 1) {
      const plan = allocator.plan({ daily: { due: true, overdue: false }, rolling: { due: true, overdue: false } }, cycle * interval);
      assert.equal(plan.length, POSITION_HISTORY_COORDINATED_REQUEST_START_BUDGET);
      totals.recent += plan.filter((lane) => lane === "RECENT_TAIL").length;
      totals.daily += plan.filter((lane) => lane === "DAILY_7_DAY").length;
      totals.rolling += plan.filter((lane) => lane === "ROLLING_90_DAY").length;
      totals.backlog += plan.filter((lane) => lane === "CONTIGUOUS_BACKLOG").length;
    }
    assert.ok(totals.recent > 0, "recent-tail keeps service");
    assert.equal(totals.recent + totals.daily + totals.rolling + totals.backlog, cycles * 5);
    if (interval === 10_500) {
      assert.ok(totals.daily >= 19 && totals.daily <= 21, "daily gets approximately 2/min where capacity permits");
      assert.ok(totals.rolling >= 39 && totals.rolling <= 41, "rolling gets approximately 4/min where capacity permits");
    } else {
      assert.ok(cycles * 5 < 26 * 10, "the slower cycle frequency cannot deliver all configured lane targets");
    }
  }
});

test("long pause, clock rollback, and process reset have bounded safe accrual", () => {
  assert.equal(positionHistoryCapacityElapsedMinutes(null, 1_000), 10_500 / 60_000);
  assert.equal(positionHistoryCapacityElapsedMinutes(1_000, 1_000 + POSITION_HISTORY_CAPACITY_MAX_ACCRUAL_MS * 100), 1);
  assert.equal(positionHistoryCapacityElapsedMinutes(1_000, 900), 0);
  assert.throws(() => positionHistoryCapacityElapsedMinutes(1_000, Number.NaN));
  const pressure = { daily: { due: true, overdue: true }, rolling: { due: true, overdue: true } };
  const allocator = new PositionHistoryCapacityAllocator();
  allocator.plan(pressure, 0);
  assert.equal(allocator.plan(pressure, 3_600_000).length, 5);
  assert.equal(allocator.plan(pressure, 3_599_000).length, 5);
  assert.equal(new PositionHistoryCapacityAllocator().plan(pressure, 3_600_000).length, 5);
});

test("overdue lanes gain service under irregular elapsed plans without exceeding five slots", () => {
  const times: number[] = [];
  let at = 0;
  for (let index = 0; index < 600; index += 1) { times.push(at); at += [10_500, 10_000, 9_500][index % 3]!; }
  const count = (overdue: boolean) => {
    const allocator = new PositionHistoryCapacityAllocator();
    const totals = { daily: 0, rolling: 0 };
    for (const at of times) {
      const plan = allocator.plan({ daily: { due: true, overdue }, rolling: { due: true, overdue } }, at);
      assert.equal(plan.length, 5);
      totals.daily += plan.filter((lane) => lane === "DAILY_7_DAY").length;
      totals.rolling += plan.filter((lane) => lane === "ROLLING_90_DAY").length;
    }
    return totals;
  };
  const normal = count(false);
  const overdue = count(true);
  assert.ok(overdue.daily > normal.daily);
  assert.ok(overdue.rolling > normal.rolling);
});

test("initial 90-day backlog model uses 5h45m progress without claiming an SLA", () => {
  const cases = [
    { vehicles: 50, steady: 12.76, requests: 18_800 },
    { vehicles: 58, steady: 14.8, requests: 21_808 },
    { vehicles: 100, steady: 25.52, requests: 37_600 },
  ];
  for (const expected of cases) {
    const model = positionHistoryInitialBacklogCapacityModel(expected.vehicles, expected.steady);
    assert.equal(model.requests, expected.requests);
    assert.equal(model.fullBudgetMinutes, expected.requests / 30);
    assert.equal(model.reservedCapacityMinutes, expected.requests / (30 - expected.steady));
  }
});
