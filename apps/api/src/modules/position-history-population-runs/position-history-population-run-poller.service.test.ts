import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { PositionHistoryPopulationRunWorkerService } from "./position-history-population-run-worker.service";
import { POSITION_HISTORY_POPULATION_RUN_POLL_INTERVAL_MS, PositionHistoryPopulationRunPollerService } from "./position-history-population-run-poller.service";
import { POSITION_HISTORY_HORIZON_EXECUTION_LOCK_KEY } from "../position-history-horizon-execution/position-history-horizon-execution-lock.service";

test("poll cadence is fixed at 30 seconds and orchestration retains the shared lock authority", () => {
  assert.equal(POSITION_HISTORY_POPULATION_RUN_POLL_INTERVAL_MS, 30_000);
  assert.equal(POSITION_HISTORY_HORIZON_EXECUTION_LOCK_KEY, 1706170003);
  const source = readFileSync("src/modules/position-history-population-runs/position-history-population-run-poller.service.ts", "utf8");
  assert.match(source, /processNextAvailableRun\(\)/);
  for (const forbidden of ["createRun", "SYSTEM", "Date.now", "horizon", "advisory", "lease", "PENDING", "RUNNING"]) assert.equal(source.includes(forbidden), false, forbidden);
});

test("LOCK_UNAVAILABLE and NO_WORK are normal, later polls retry, and wrapper errors are contained", async () => {
  const outcomes = ["LOCK_UNAVAILABLE", "NO_WORK", "throw", "NO_WORK"] as const; let calls = 0;
  const worker = { processNextAvailableRun: async () => { const value = outcomes[calls++]!; if (value === "throw") throw new Error("provider-token secret URL coordinates"); return { outcome: value, runId: null, committedWindows: null }; } } as unknown as PositionHistoryPopulationRunWorkerService;
  const poller = new PositionHistoryPopulationRunPollerService(worker);
  const logger = (poller as unknown as { logger: { error(message: string): void } }).logger; const logged: string[] = []; logger.error = (message) => { logged.push(message); };
  await poller.poll(); await poller.poll(); await poller.poll(); await poller.poll();
  assert.equal(calls, 4); assert.deepEqual(logged, ["Durable position-history population poll failed safely."]);
  assert.equal(logged.join(" ").includes("secret"), false);
});

test("local overlap suppression is only an optimization and a later invocation proceeds", async () => {
  let release!: () => void; let calls = 0;
  const worker = { processNextAvailableRun: async () => { calls += 1; await new Promise<void>((resolve) => { release = resolve; }); return { outcome: "NO_WORK", runId: null, committedWindows: null }; } } as unknown as PositionHistoryPopulationRunWorkerService;
  const poller = new PositionHistoryPopulationRunPollerService(worker); const first = poller.poll(); await Promise.resolve(); await poller.poll(); assert.equal(calls, 1); release(); await first;
  const second = poller.poll(); await Promise.resolve(); assert.equal(calls, 2); release(); await second;
});

