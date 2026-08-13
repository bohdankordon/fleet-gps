import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { POSITION_HISTORY_HORIZON_EXECUTION_LOCK_KEY } from "../position-history-horizon-execution/position-history-horizon-execution-lock.service";
import { POSITION_HISTORY_POPULATION_RUN_CHUNK_WINDOWS, POSITION_HISTORY_POPULATION_RUN_HEARTBEAT_MS, POSITION_HISTORY_POPULATION_RUN_LEASE_DURATION_MS } from "./position-history-population-run.constants";
import { PositionHistoryPopulationRunModule } from "./position-history-population-run.module";

test("module exposes admin orchestration, reuses Stage 14C and the Stage 17C lock, and registers no automatic creation", () => {
  assert.equal(POSITION_HISTORY_HORIZON_EXECUTION_LOCK_KEY, 1706170003);
  assert.equal(POSITION_HISTORY_POPULATION_RUN_CHUNK_WINDOWS, 24);
  assert.equal(POSITION_HISTORY_POPULATION_RUN_LEASE_DURATION_MS, 120_000);
  assert.equal(POSITION_HISTORY_POPULATION_RUN_HEARTBEAT_MS, 30_000);
  const imports = (Reflect.getMetadata("imports", PositionHistoryPopulationRunModule) as Array<{ name: string }>).map((value) => value.name);
  assert.deepEqual(imports, ["DatabaseModule", "PositionHistoryHorizonPopulationModule", "PositionHistoryHorizonExecutionModule"]);
  const source = readFileSync("src/modules/position-history-population-runs/position-history-population-run.module.ts", "utf8");
  assert.doesNotMatch(source, /onModuleInit|@Cron|ScheduleModule|setTimeout|createRun\(\{[^}]*SYSTEM/);
  assert.deepEqual((Reflect.getMetadata("controllers", PositionHistoryPopulationRunModule) as Array<{ name: string }>).map((value) => value.name), ["PositionHistoryPopulationRunAdminController"]);
});
