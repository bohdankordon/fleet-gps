import assert from "node:assert/strict";
import test from "node:test";
import type { ApiConfig } from "../../config/api-config";
import type { AlertNotificationDispatcherService, AlertNotificationDispatchBatchResult } from "../alert-notifications/alert-notification-dispatcher.service";
import type { SchedulerTimerAdapter } from "../sync-scheduler/scheduler-timer.adapter";
import type { Clock } from "../sync-scheduler/sync-scheduler-clock";
import { AlertNotificationSchedulerStatusService } from "./alert-notification-scheduler-status.service";
import { ALERT_NOTIFICATION_DISPATCH_INTERVAL_NAME, AlertNotificationSchedulerService } from "./alert-notification-scheduler.service";

const emptyBatch: AlertNotificationDispatchBatchResult = Object.freeze({ claimed: 0, sent: 0, retryScheduled: 0, failedPermanent: 0, lostLease: 0 });

class ManualClock implements Clock {
  public constructor(private readonly dates = Array.from({ length: 40 }, () => new Date("2026-08-08T12:00:00.000Z"))) {}
  public now(): Date { return this.dates.shift() ?? new Date("2026-08-08T12:00:00.000Z"); }
}

class FakeTimerAdapter implements SchedulerTimerAdapter {
  public readonly intervals = new Map<string, { callback: () => void; milliseconds: number }>();
  public readonly deleted: string[] = [];
  public addInterval(name: string, callback: () => void, milliseconds: number): void {
    if (this.intervals.has(name)) throw new Error("duplicate timer");
    this.intervals.set(name, { callback, milliseconds });
  }
  public deleteInterval(name: string): void { this.deleted.push(name); this.intervals.delete(name); }
  public hasInterval(name: string): boolean { return this.intervals.has(name); }
  public fire(name = ALERT_NOTIFICATION_DISPATCH_INTERVAL_NAME): void { this.intervals.get(name)?.callback(); }
}

type Deferred<T> = { promise: Promise<T>; resolve(value: T): void; reject(error: unknown): void };
function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined;
  let reject: (error: unknown) => void = () => undefined;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

function apiConfig(enabled: boolean, dispatchIntervalMs = 60_000, batchSize = 20): ApiConfig {
  return {
    telegramNotifications: { enabled, botToken: enabled ? "unit-test-token" : null, chatId: enabled ? "unit-test-chat" : null, dispatchIntervalMs, batchSize },
  } as unknown as ApiConfig;
}

function subject(options: Readonly<{
  enabled?: boolean;
  interval?: number;
  batchSize?: number;
  dispatch?: (limit: number, signal?: AbortSignal) => Promise<AlertNotificationDispatchBatchResult>;
  clock?: Clock;
}> = {}) {
  const timer = new FakeTimerAdapter();
  const status = new AlertNotificationSchedulerStatusService();
  const calls: number[] = [];
  const signals: AbortSignal[] = [];
  const dispatcher = {
    dispatchBatch: (limit: number, signal?: AbortSignal) => {
      calls.push(limit);
      if (signal !== undefined) signals.push(signal);
      return options.dispatch?.(limit, signal) ?? Promise.resolve(emptyBatch);
    },
  } as AlertNotificationDispatcherService;
  const config = apiConfig(options.enabled ?? true, options.interval ?? 60_000, options.batchSize ?? 20);
  const service = new AlertNotificationSchedulerService(config, dispatcher, status, options.clock ?? new ManualClock(), timer);
  return { service, status, timer, calls, signals, config };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

test("disabled scheduler creates no timer and performs zero dispatcher calls", async () => {
  const item = subject({ enabled: false });
  item.service.onModuleInit();
  item.timer.fire();
  await flush();
  assert.equal(item.timer.intervals.size, 0);
  assert.deepEqual(item.calls, []);
  assert.deepEqual(item.service.getStatus(), {
    enabled: false, started: false, running: false,
    successfulRuns: 0, failedRuns: 0, skippedOverlaps: 0,
    lastStartedAt: null, lastFinishedAt: null, lastSuccessAt: null, lastFailureAt: null,
    lastFailureCategory: null, lastBatch: null, dispatchIntervalMs: 60_000, batchSize: 20,
  });
});

test("enabled init registers exactly one configured timer without immediate dispatch and repeated init is idempotent", () => {
  const item = subject({ interval: 12_345, batchSize: 17 });
  item.service.onModuleInit();
  item.service.onModuleInit();
  assert.equal(item.timer.intervals.size, 1);
  assert.equal(item.timer.intervals.get(ALERT_NOTIFICATION_DISPATCH_INTERVAL_NAME)?.milliseconds, 12_345);
  assert.deepEqual(item.calls, []);
  const status = item.service.getStatus();
  assert.equal(status.enabled, true);
  assert.equal(status.started, true);
  assert.equal(status.batchSize, 17);
});

test("normal ticks dispatch repeatedly with the configured batch size", async () => {
  const item = subject({ batchSize: 37 });
  item.service.onModuleInit();
  item.timer.fire();
  await flush();
  item.timer.fire();
  await flush();
  assert.deepEqual(item.calls, [37, 37]);
  assert.equal(item.service.getStatus().successfulRuns, 2);
  assert.equal(item.service.getStatus().running, false);
});

test("an unresolved cycle skips overlap and a later tick runs after the guard clears", async () => {
  const first = deferred<AlertNotificationDispatchBatchResult>();
  let invocation = 0;
  const item = subject({ dispatch: () => ++invocation === 1 ? first.promise : Promise.resolve(emptyBatch) });
  item.service.onModuleInit();
  item.timer.fire();
  item.timer.fire();
  assert.equal(item.calls.length, 1);
  assert.equal(item.service.getStatus().skippedOverlaps, 1);
  assert.equal(item.service.getStatus().running, true);
  first.resolve(emptyBatch);
  await flush();
  item.timer.fire();
  await flush();
  assert.equal(item.calls.length, 2);
  assert.equal(item.service.getStatus().running, false);
});

test("resolved retry and permanent aggregates are scheduler success and copied into safe status", async () => {
  const batch = Object.freeze({ claimed: 5, sent: 2, retryScheduled: 1, failedPermanent: 1, lostLease: 1 });
  const item = subject({ dispatch: async () => batch });
  item.service.onModuleInit();
  item.timer.fire();
  await flush();
  const status = item.service.getStatus();
  assert.equal(status.successfulRuns, 1);
  assert.equal(status.failedRuns, 0);
  assert.deepEqual(status.lastBatch, batch);
  assert.notEqual(status.lastBatch, batch);
  assert.notEqual(status.lastStartedAt, null);
  assert.equal(status.lastFinishedAt, status.lastSuccessAt);
});

test("unexpected dispatcher rejection is contained, clears running, and the next tick succeeds", async () => {
  let invocation = 0;
  const item = subject({ dispatch: () => ++invocation === 1 ? Promise.reject(new Error("private database detail")) : Promise.resolve(emptyBatch) });
  const unhandled: unknown[] = [];
  const listener = (error: unknown): void => { unhandled.push(error); };
  process.on("unhandledRejection", listener);
  try {
    item.service.onModuleInit();
    item.timer.fire();
    await flush();
    let status = item.service.getStatus();
    assert.equal(status.failedRuns, 1);
    assert.equal(status.running, false);
    assert.equal(status.lastFailureCategory, "UNEXPECTED_DISPATCHER_FAILURE");
    assert.equal(JSON.stringify(status).includes("private database detail"), false);
    item.timer.fire();
    await flush();
    status = item.service.getStatus();
    assert.equal(status.successfulRuns, 1);
    assert.equal(status.running, false);
    assert.equal(item.calls.length, 2);
    assert.deepEqual(unhandled, []);
  } finally {
    process.off("unhandledRejection", listener);
  }
});

test("synchronous dispatcher throw is contained and does not poison subsequent ticks", async () => {
  let invocation = 0;
  const item = subject({ dispatch: () => {
    invocation += 1;
    if (invocation === 1) throw new Error("private programming detail");
    return Promise.resolve(emptyBatch);
  } });
  item.service.onModuleInit();
  item.timer.fire();
  await flush();
  assert.equal(item.service.getStatus().failedRuns, 1);
  assert.equal(item.service.getStatus().running, false);
  item.timer.fire();
  await flush();
  assert.equal(item.service.getStatus().successfulRuns, 1);
});

test("destroy removes the timer, stops status, blocks new work, waits for active work, and is idempotent", async () => {
  const pending = deferred<AlertNotificationDispatchBatchResult>();
  const item = subject({ dispatch: () => pending.promise });
  item.service.onModuleInit();
  item.timer.fire();
  const firstDestroy = item.service.onModuleDestroy();
  const secondDestroy = item.service.onModuleDestroy();
  assert.equal(firstDestroy, secondDestroy);
  assert.equal(item.timer.hasInterval(ALERT_NOTIFICATION_DISPATCH_INTERVAL_NAME), false);
  assert.equal(item.service.getStatus().started, false);
  assert.equal(item.signals[0]?.aborted, true);
  item.timer.fire();
  assert.equal(item.calls.length, 1);
  pending.resolve(emptyBatch);
  await firstDestroy;
  assert.equal(item.service.getStatus().running, false);
  assert.deepEqual(item.timer.deleted, [ALERT_NOTIFICATION_DISPATCH_INTERVAL_NAME]);
});

test("destroy cooperatively stops an active batch after its current notification and starts no next claim", async () => {
  const currentDelivery = deferred<void>();
  let claimsStarted = 0;
  const item = subject({ batchSize: 20, dispatch: async (_limit, signal) => {
    claimsStarted += 1;
    await currentDelivery.promise;
    if (signal?.aborted !== true) claimsStarted += 1;
    return { claimed: 1, sent: 1, retryScheduled: 0, failedPermanent: 0, lostLease: 0 };
  } });
  item.service.onModuleInit();
  item.timer.fire();
  assert.equal(claimsStarted, 1);
  assert.equal(item.signals[0]?.aborted, false);

  const destroying = item.service.onModuleDestroy();
  assert.equal(item.timer.hasInterval(ALERT_NOTIFICATION_DISPATCH_INTERVAL_NAME), false);
  assert.equal(item.service.getStatus().started, false);
  assert.equal(item.service.getStatus().running, true);
  assert.equal(item.signals[0]?.aborted, true);
  currentDelivery.resolve(undefined);
  await destroying;

  assert.equal(claimsStarted, 1);
  assert.equal(item.calls.length, 1);
  assert.equal(item.service.getStatus().running, false);
  assert.equal(item.service.getStatus().successfulRuns, 1);
  item.timer.fire();
  assert.equal(item.calls.length, 1);
});

test("every normal cycle receives a fresh non-aborted controller", async () => {
  const item = subject();
  item.service.onModuleInit();
  item.timer.fire();
  await flush();
  item.timer.fire();
  await flush();
  assert.equal(item.signals.length, 2);
  assert.notEqual(item.signals[0], item.signals[1]);
  assert.equal(item.signals[0]?.aborted, false);
  assert.equal(item.signals[1]?.aborted, false);
});

test("status exposes only aggregate fields and never dispatcher identifiers or Telegram material", async () => {
  const item = subject({ dispatch: async () => ({ claimed: 1, sent: 1, retryScheduled: 0, failedPermanent: 0, lostLease: 0 }) });
  item.service.onModuleInit();
  item.timer.fire();
  await flush();
  const serialized = JSON.stringify(item.service.getStatus());
  for (const forbidden of ["notificationId", "eventId", "vehicleId", "chatId", "botToken", "message", "unit-test-token", "unit-test-chat"]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test("invalid clock prevents dispatch and invalid completion still clears the running guard", async () => {
  const before = subject({ clock: new ManualClock([new Date("invalid")]) });
  before.service.onModuleInit();
  before.timer.fire();
  await flush();
  assert.equal(before.calls.length, 0);

  const pending = deferred<AlertNotificationDispatchBatchResult>();
  const after = subject({ clock: new ManualClock([new Date("2026-08-08T12:00:00.000Z"), new Date("invalid")]), dispatch: () => pending.promise });
  after.service.onModuleInit();
  after.timer.fire();
  pending.resolve(emptyBatch);
  await flush();
  assert.equal(after.service.getStatus().running, false);
});
