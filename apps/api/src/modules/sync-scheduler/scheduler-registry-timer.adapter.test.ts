import assert from "node:assert/strict";
import test from "node:test";
import { SchedulerRegistry } from "@nestjs/schedule";
import { SchedulerRegistryTimerAdapter } from "./scheduler-registry-timer.adapter";

class FakeSchedulerRegistry {
  public readonly intervals = new Map<string, unknown>();
  public addCalls = 0;
  public deleteCalls = 0;

  public doesExist(type: "cron" | "timeout" | "interval", name: string): boolean {
    return type === "interval" && this.intervals.has(name);
  }

  public addInterval(name: string, interval: unknown): void {
    this.addCalls += 1;
    if (this.intervals.has(name)) throw new Error("duplicate");
    this.intervals.set(name, interval);
  }

  public deleteInterval(name: string): void {
    this.deleteCalls += 1;
    const interval = this.intervals.get(name);
    if (interval !== undefined) clearInterval(interval as NodeJS.Timeout);
    this.intervals.delete(name);
  }
}

test("registry timer adapter registers, exposes presence, and deletes one interval", () => {
  const registry = new FakeSchedulerRegistry();
  const adapter = new SchedulerRegistryTimerAdapter(registry as unknown as SchedulerRegistry);
  let calls = 0;

  assert.equal(adapter.addInterval("fleet", () => { calls += 1; }, 60_000), undefined);
  assert.equal(registry.addCalls, 1);
  assert.equal(adapter.hasInterval("fleet"), true);

  const callback = (registry.intervals.get("fleet") as NodeJS.Timeout & { _onTimeout: () => void })._onTimeout;
  assert.equal(typeof callback, "function");
  assert.equal((registry.intervals.get("fleet") as NodeJS.Timeout & { _idleTimeout: number })._idleTimeout, 60_000);
  callback();

  adapter.deleteInterval("fleet");
  assert.equal(registry.deleteCalls, 1);
  assert.equal(adapter.hasInterval("fleet"), false);
  adapter.deleteInterval("fleet");
  assert.equal(registry.deleteCalls, 1);

  return Promise.resolve().then(() => Promise.resolve()).then(() => assert.equal(calls, 1));
});

test("registry timer adapter rejects duplicate names with a safe error", () => {
  const registry = new FakeSchedulerRegistry();
  const adapter = new SchedulerRegistryTimerAdapter(registry as unknown as SchedulerRegistry);
  adapter.addInterval("runs", () => undefined, 300_000);

  assert.throws(() => adapter.addInterval("runs", () => undefined, 300_000), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal(error.message, "Invalid scheduler timer state.");
    assert.equal(error.message.includes("runs"), false);
    return true;
  });
  adapter.deleteInterval("runs");
});

test("registry timer adapter consumes callback rejections and exposes no timer handle", async () => {
  const registry = new FakeSchedulerRegistry();
  const adapter = new SchedulerRegistryTimerAdapter(registry as unknown as SchedulerRegistry);
  const rawError = new Error("private callback failure");
  let unhandled = false;
  let consoleErrors = 0;
  const onUnhandled = () => { unhandled = true; };
  const originalConsoleError = console.error;
  process.once("unhandledRejection", onUnhandled);
  console.error = () => { consoleErrors += 1; };

  try {
    adapter.addInterval("fleet", () => { throw rawError; }, 60_000);
    const callback = (registry.intervals.get("fleet") as NodeJS.Timeout & { _onTimeout: () => void })._onTimeout;
    assert.equal(callback(), undefined);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  } finally {
    console.error = originalConsoleError;
    process.removeListener("unhandledRejection", onUnhandled);
    adapter.deleteInterval("fleet");
  }

  assert.equal(unhandled, false);
  assert.equal(consoleErrors, 0);
  assert.equal(Object.values(adapter).some((value) => value === registry.intervals.get("fleet")), false);
});
