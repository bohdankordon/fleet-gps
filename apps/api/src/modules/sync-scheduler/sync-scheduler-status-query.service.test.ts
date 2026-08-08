import assert from "node:assert/strict";
import test from "node:test";
import type { ApiConfig } from "../../config/api-config";
import { SyncSchedulerStatusQueryService } from "./sync-scheduler-status-query.service";
import { SyncSchedulerStatusService } from "./sync-scheduler-status.service";
import { SyncSchedulerStateError } from "./sync-scheduler.types";

const config: ApiConfig = Object.freeze({ host: "127.0.0.1", port: 3_000, database: Object.freeze({ url: "postgresql://user:password@example.test/db", poolMax: 1, connectionTimeoutMs: 100, idleTimeoutMs: 1_000 }), equGps: Object.freeze({ officialBaseUrl: "https://trace.example.test", webBaseUrl: "https://web.example.test", email: "user@example.test", password: "password", requestTimeoutMs: 1_000, runsRequestTimeoutMs: 45_000 }), syncScheduler: Object.freeze({ enabled: false, fleetIntervalSeconds: 60, runsIntervalSeconds: 300, shutdownTimeoutMs: 50_000 }), alertIngestion: Object.freeze({ enabled: false }), telegramNotifications: Object.freeze({ enabled: false, botToken: null, chatId: null }) });

test("status query reads the clock once and returns only the safe snapshot", () => {
  let calls = 0;
  const service = new SyncSchedulerStatusQueryService(config, { now: () => { calls += 1; return new Date("2026-08-06T10:00:00.000Z"); } }, new SyncSchedulerStatusService());
  const status = service.getStatus();
  assert.equal(calls, 1);
  assert.equal(status.fleetIntervalSeconds, 60);
  assert.equal(status.runsIntervalSeconds, 300);
  assert.equal("shutdownTimeoutMs" in status, false);
  assert.equal(status.fleet.successfulRuns, 0);
});

test("status query hides invalid clock details", () => {
  const service = new SyncSchedulerStatusQueryService(config, { now: () => new Date("invalid") }, new SyncSchedulerStatusService());
  assert.throws(() => service.getStatus(), (error: unknown) => {
    assert.ok(error instanceof SyncSchedulerStateError);
    assert.equal(error.message, "Invalid sync scheduler state.");
    return true;
  });
});
