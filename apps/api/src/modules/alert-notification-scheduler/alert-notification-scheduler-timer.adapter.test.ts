import assert from "node:assert/strict";
import test from "node:test";
import { AlertNotificationSchedulerTimerAdapter } from "./alert-notification-scheduler-timer.adapter";

test("native notification timer adapter tracks one interval and clears it", () => {
  const adapter = new AlertNotificationSchedulerTimerAdapter();
  adapter.addInterval("safe-name", () => undefined, 60_000);
  assert.equal(adapter.hasInterval("safe-name"), true);
  adapter.deleteInterval("safe-name");
  assert.equal(adapter.hasInterval("safe-name"), false);
  adapter.deleteInterval("safe-name");
});

test("native notification timer adapter rejects duplicate names", () => {
  const adapter = new AlertNotificationSchedulerTimerAdapter();
  try {
    adapter.addInterval("safe-name", () => undefined, 60_000);
    assert.throws(() => adapter.addInterval("safe-name", () => undefined, 60_000), /already exists/);
  } finally {
    adapter.deleteInterval("safe-name");
  }
});

