const assert = require("node:assert/strict");

const timerName = "taxi-gps:notifications:telegram";
const emptyBatch = Object.freeze({ claimed: 0, sent: 0, retryScheduled: 0, failedPermanent: 0, lostLease: 0 });

class FakeTimerAdapter {
  constructor() { this.intervals = new Map(); }
  addInterval(name, callback, milliseconds) {
    if (this.intervals.has(name)) throw new Error("duplicate timer");
    this.intervals.set(name, { callback, milliseconds });
  }
  deleteInterval(name) { this.intervals.delete(name); }
  hasInterval(name) { return this.intervals.has(name); }
  fire(name = timerName) { this.intervals.get(name)?.callback(); }
}

class FixedClock {
  now() { return new Date("2026-08-08T12:00:00.000Z"); }
}

function config(enabled) {
  return { telegramNotifications: { enabled, botToken: enabled ? "fake-only" : null, chatId: enabled ? "fake-only" : null, dispatchIntervalMs: 60_000, batchSize: 20 } };
}

function deferred() {
  let resolve = () => undefined;
  const promise = new Promise((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
}

async function main() {
  const nativeFetch = globalThis.fetch;
  let externalRequests = 0;
  globalThis.fetch = async () => { externalRequests += 1; throw new Error("Unexpected external request"); };

  try {
    const { AlertNotificationSchedulerService } = require("../dist/modules/alert-notification-scheduler/alert-notification-scheduler.service");
    const { AlertNotificationSchedulerStatusService } = require("../dist/modules/alert-notification-scheduler/alert-notification-scheduler-status.service");

    let disabledCalls = 0;
    const disabledTimer = new FakeTimerAdapter();
    const disabled = new AlertNotificationSchedulerService(
      config(false),
      { dispatchBatch: async () => { disabledCalls += 1; return emptyBatch; } },
      new AlertNotificationSchedulerStatusService(),
      new FixedClock(),
      disabledTimer,
    );
    disabled.onModuleInit();
    assert.equal(disabled.getStatus().started, false);
    assert.equal(disabledTimer.intervals.size, 0);
    assert.equal(disabledCalls, 0);
    await disabled.onModuleDestroy();

    const first = deferred();
    const shutdownDelivery = deferred();
    let calls = 0;
    let shutdownClaims = 0;
    let shutdownSignal;
    const timer = new FakeTimerAdapter();
    const dispatcher = {
      dispatchBatch: async (_limit, signal) => {
        calls += 1;
        if (calls === 1) return first.promise;
        if (calls === 2) throw new Error("private database detail");
        if (calls === 3) return { claimed: 1, sent: 1, retryScheduled: 0, failedPermanent: 0, lostLease: 0 };
        shutdownSignal = signal;
        shutdownClaims += 1;
        await shutdownDelivery.promise;
        if (!signal.aborted) shutdownClaims += 1;
        return { claimed: 1, sent: 1, retryScheduled: 0, failedPermanent: 0, lostLease: 0 };
      },
    };
    const enabled = new AlertNotificationSchedulerService(
      config(true), dispatcher, new AlertNotificationSchedulerStatusService(), new FixedClock(), timer,
    );
    enabled.onModuleInit();
    assert.equal(timer.hasInterval(timerName), true);
    assert.equal(timer.intervals.get(timerName).milliseconds, 60_000);
    assert.equal(calls, 0);

    timer.fire();
    timer.fire();
    assert.equal(calls, 1);
    assert.equal(enabled.getStatus().running, true);
    assert.equal(enabled.getStatus().skippedOverlaps, 1);
    first.resolve(emptyBatch);
    await flush();

    timer.fire();
    await flush();
    assert.equal(enabled.getStatus().failedRuns, 1);
    assert.equal(enabled.getStatus().running, false);

    timer.fire();
    await flush();
    assert.equal(calls, 3);
    assert.equal(enabled.getStatus().successfulRuns, 2);
    assert.equal(enabled.getStatus().lastBatch.sent, 1);

    timer.fire();
    assert.equal(calls, 4);
    assert.equal(shutdownClaims, 1);
    assert.equal(shutdownSignal.aborted, false);
    const destroying = enabled.onModuleDestroy();
    assert.equal(shutdownSignal.aborted, true);
    assert.equal(timer.hasInterval(timerName), false);
    assert.equal(enabled.getStatus().started, false);
    shutdownDelivery.resolve();
    await destroying;
    assert.equal(shutdownClaims, 1);
    assert.equal(timer.hasInterval(timerName), false);
    assert.equal(enabled.getStatus().started, false);
    assert.equal(enabled.getStatus().running, false);
    assert.equal(externalRequests, 0);

    console.log("alert notification scheduler smoke: passed");
    console.log("disabled started: false");
    console.log("disabled dispatcher calls: 0");
    console.log("timer registered: true");
    console.log("immediate dispatcher calls: 0");
    console.log("first tick dispatched: true");
    console.log("overlap skipped: 1");
    console.log("failure recovered: true");
    console.log("cooperative shutdown: verified");
    console.log("timer cleared: true");
    console.log("external requests: 0");
  } finally {
    globalThis.fetch = nativeFetch;
  }
}

main().catch(() => {
  console.error("alert notification scheduler smoke: failed");
  process.exitCode = 1;
});
