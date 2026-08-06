import assert from "node:assert/strict";
import test from "node:test";
import type { ApiConfig } from "../../config/api-config";
import type { DailyRunsSyncService } from "../dashboard/daily-runs-sync.service";
import type { FleetSyncService } from "../fleet/fleet-sync.service";
import { SyncSchedulerStatusService } from "./sync-scheduler-status.service";
import { SyncSchedulerService } from "./sync-scheduler.service";
import type { Clock } from "./sync-scheduler-clock";
import type { SchedulerTimerAdapter } from "./scheduler-timer.adapter";

const fleetName = "taxi-gps:sync:fleet";
const runsName = "taxi-gps:sync:runs";
const schedulerConfig = Object.freeze({ enabled: true, fleetIntervalSeconds: 60, runsIntervalSeconds: 300, shutdownTimeoutMs: 50 });
const apiConfig: ApiConfig = Object.freeze({
  host: "127.0.0.1",
  port: 3_000,
  database: Object.freeze({ url: "postgresql://user:password@example.test/db", poolMax: 1, connectionTimeoutMs: 100, idleTimeoutMs: 1_000 }),
  equGps: Object.freeze({ officialBaseUrl: "https://trace.example.test", webBaseUrl: "https://web.example.test", email: "user@example.test", password: "password", requestTimeoutMs: 1_000, runsRequestTimeoutMs: 45_000 }),
  syncScheduler: schedulerConfig,
});

class ManualClock implements Clock {
  public calls = 0;
  public constructor(private readonly dates: Date[]) {}
  public now(): Date {
    this.calls += 1;
    return this.dates.shift() ?? new Date("2026-08-06T12:00:00.000Z");
  }
}

class FakeTimerAdapter implements SchedulerTimerAdapter {
  public readonly intervals = new Map<string, { callback: () => void; milliseconds: number }>();
  public failName: string | null = null;
  public deleteCalls: string[] = [];
  public addInterval(name: string, callback: () => void, milliseconds: number): void {
    if (name === this.failName) throw new Error("private registration failure");
    if (this.intervals.has(name)) throw new Error("duplicate");
    this.intervals.set(name, { callback, milliseconds });
  }
  public deleteInterval(name: string): void {
    this.deleteCalls.push(name);
    this.intervals.delete(name);
  }
  public hasInterval(name: string): boolean { return this.intervals.has(name); }
  public fire(name: string): void { this.intervals.get(name)?.callback(); }
}

type Deferred = { promise: Promise<void>; resolve(): void; reject(error: unknown): void };
function deferred(): Deferred {
  let resolve: () => void = () => undefined;
  let reject: (error: unknown) => void = () => undefined;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

function testService(options: Readonly<{ enabled?: boolean; clock?: Date[]; fleet?: () => Promise<void>; runs?: () => Promise<void>; timeoutFactory?: (milliseconds: number) => { promise: Promise<void>; clear(): void } }> = {}) {
  const timer = new FakeTimerAdapter();
  const status = new SyncSchedulerStatusService();
  const clock = new ManualClock(options.clock ?? Array.from({ length: 30 }, () => new Date("2026-08-06T10:00:00.000Z")));
  let fleetCalls = 0;
  let runsCalls = 0;
  const fleet = { syncLatestSnapshot: () => { fleetCalls += 1; return options.fleet?.() ?? Promise.resolve(); } } as unknown as FleetSyncService;
  const runs = { syncCurrentDayRuns: () => { runsCalls += 1; return options.runs?.() ?? Promise.resolve(); } } as unknown as DailyRunsSyncService;
  const config: ApiConfig = Object.freeze({ ...apiConfig, syncScheduler: Object.freeze({ ...schedulerConfig, enabled: options.enabled ?? true }) });
  const service = new SyncSchedulerService(config, fleet, runs, status, clock, timer, options.timeoutFactory);
  return { service, timer, status, clock, fleetCalls: () => fleetCalls, runsCalls: () => runsCalls };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

test("disabled bootstrap registers no timers and enabled bootstrap registers exactly two without immediate sync", () => {
  const disabled = testService({ enabled: false });
  disabled.service.onApplicationBootstrap();
  assert.equal(disabled.timer.intervals.size, 0);
  assert.equal(disabled.status.snapshot(schedulerConfig, new Date("2026-08-06T10:00:00.000Z")).startedAt, null);

  const enabled = testService();
  enabled.service.onApplicationBootstrap();
  enabled.service.onApplicationBootstrap();
  assert.equal(enabled.timer.intervals.size, 2);
  assert.equal(enabled.timer.intervals.get(fleetName)?.milliseconds, 60_000);
  assert.equal(enabled.timer.intervals.get(runsName)?.milliseconds, 300_000);
  assert.equal(enabled.fleetCalls(), 0);
  assert.equal(enabled.runsCalls(), 0);
  assert.notEqual(enabled.status.snapshot(schedulerConfig, new Date()).startedAt, null);
});

test("partial timer registration rolls back fleet timer", () => {
  const subject = testService();
  subject.timer.failName = runsName;
  subject.service.onApplicationBootstrap();
  assert.equal(subject.timer.hasInterval(fleetName), false);
  assert.equal(subject.timer.hasInterval(runsName), false);
  assert.deepEqual(subject.timer.deleteCalls, [fleetName]);
  assert.equal(subject.status.snapshot(schedulerConfig, new Date()).startedAt, null);
  assert.equal(subject.fleetCalls(), 0);
  assert.equal(subject.runsCalls(), 0);
});

test("callbacks run only their matching job and update success or safe failure status", async () => {
  let failFleet = false;
  const subject = testService({ fleet: () => failFleet ? Promise.reject(new Error("private")) : Promise.resolve() });
  subject.service.onApplicationBootstrap();
  subject.timer.fire(fleetName);
  await flush();
  assert.equal(subject.fleetCalls(), 1);
  assert.equal(subject.runsCalls(), 0);
  assert.equal(subject.status.snapshot(schedulerConfig, new Date()).fleet.successfulRuns, 1);

  failFleet = true;
  subject.timer.fire(fleetName);
  await flush();
  const fleet = subject.status.snapshot(schedulerConfig, new Date()).fleet;
  assert.equal(fleet.failedRuns, 1);
  assert.equal(fleet.lastFailureCategory, "unknown");
  assert.equal(subject.timer.hasInterval(fleetName), true);
  assert.equal(subject.fleetCalls(), 2);
});

test("fleet and runs have independent overlap locks and can be active together", async () => {
  const fleet = deferred();
  const runs = deferred();
  const subject = testService({ fleet: () => fleet.promise, runs: () => runs.promise });
  subject.service.onApplicationBootstrap();
  subject.timer.fire(fleetName);
  subject.timer.fire(fleetName);
  subject.timer.fire(runsName);
  subject.timer.fire(runsName);
  assert.equal(subject.fleetCalls(), 1);
  assert.equal(subject.runsCalls(), 1);
  let snapshot = subject.status.snapshot(schedulerConfig, new Date());
  assert.equal(snapshot.fleet.skippedOverlaps, 1);
  assert.equal(snapshot.runs.skippedOverlaps, 1);
  assert.equal(snapshot.fleet.running, true);
  assert.equal(snapshot.runs.running, true);
  fleet.resolve();
  runs.resolve();
  await flush();
  snapshot = subject.status.snapshot(schedulerConfig, new Date());
  assert.equal(snapshot.fleet.running, false);
  assert.equal(snapshot.runs.running, false);
});

test("invalid clock before start does not run sync and invalid completion clears running", async () => {
  const invalid = new Date("invalid");
  const beforeStart = testService({ clock: [new Date("2026-08-06T10:00:00.000Z"), invalid] });
  beforeStart.service.onApplicationBootstrap();
  beforeStart.timer.fire(fleetName);
  await flush();
  assert.equal(beforeStart.fleetCalls(), 0);

  const pending = deferred();
  const afterStart = testService({ clock: [new Date("2026-08-06T10:00:00.000Z"), new Date("2026-08-06T10:01:00.000Z"), invalid], fleet: () => pending.promise });
  afterStart.service.onApplicationBootstrap();
  afterStart.timer.fire(fleetName);
  pending.resolve();
  await flush();
  assert.equal(afterStart.status.snapshot(schedulerConfig, new Date()).fleet.running, false);
});

test("destroy deletes timers, blocks callbacks, waits for active work, and is idempotent", async () => {
  const pending = deferred();
  const subject = testService({ fleet: () => pending.promise });
  subject.service.onApplicationBootstrap();
  subject.timer.fire(fleetName);
  const firstDestroy = subject.service.onModuleDestroy();
  const secondDestroy = subject.service.onModuleDestroy();
  assert.equal(firstDestroy, secondDestroy);
  assert.equal(subject.timer.intervals.size, 0);
  subject.timer.fire(fleetName);
  assert.equal(subject.fleetCalls(), 1);
  pending.resolve();
  await firstDestroy;
  assert.equal(subject.status.snapshot(schedulerConfig, new Date()).fleet.running, false);
});

test("forced shutdown timeout clears running and ignores a late completion", async () => {
  const pending = deferred();
  let resolveTimeout: () => void = () => undefined;
  let cleared = 0;
  const timeoutFactory = () => ({ promise: new Promise<void>((resolve) => { resolveTimeout = resolve; }), clear: () => { cleared += 1; } });
  const subject = testService({ fleet: () => pending.promise, timeoutFactory });
  subject.service.onApplicationBootstrap();
  subject.timer.fire(fleetName);
  const destroying = subject.service.onModuleDestroy();
  resolveTimeout();
  await destroying;
  assert.equal(cleared, 1);
  assert.equal(subject.status.snapshot(schedulerConfig, new Date()).fleet.running, false);
  pending.resolve();
  await flush();
  const fleet = subject.status.snapshot(schedulerConfig, new Date()).fleet;
  assert.equal(fleet.successfulRuns, 0);
  assert.equal(fleet.failedRuns, 0);
});
