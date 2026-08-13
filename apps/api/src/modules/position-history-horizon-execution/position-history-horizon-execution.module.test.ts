import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PositionHistoryHorizonExecutionController } from "./position-history-horizon-execution.controller";
import { POSITION_HISTORY_HORIZON_EXECUTION_LOCK_KEY } from "./position-history-horizon-execution-lock.service";
import { PositionHistoryHorizonExecutionModule } from "./position-history-horizon-execution.module";

test("execution module composes Stage 14C with the shared lock module and one dedicated pg Client factory", () => {
  assert.deepEqual((Reflect.getMetadata("imports", PositionHistoryHorizonExecutionModule) as Array<{ name: string }>).map((value) => value.name), ["PositionHistoryHorizonExecutionLockModule", "PositionHistoryHorizonPopulationModule"]);
  assert.deepEqual(Reflect.getMetadata("controllers", PositionHistoryHorizonExecutionModule), [PositionHistoryHorizonExecutionController]);
  const moduleSource = readFileSync("src/modules/position-history-horizon-execution/position-history-horizon-execution-lock.module.ts", "utf8");
  const lockSource = readFileSync("src/modules/position-history-horizon-execution/position-history-horizon-execution-lock.service.ts", "utf8");
  assert.match(moduleSource, /new Client\(/); assert.match(moduleSource, /client\.connect\(\)/); assert.match(moduleSource, /client\.end\(\)/);
  assert.match(lockSource, /pg_try_advisory_lock/); assert.match(lockSource, /pg_advisory_unlock/); assert.equal(POSITION_HISTORY_HORIZON_EXECUTION_LOCK_KEY, 1706170003);
  assert.doesNotMatch(`${moduleSource}\n${lockSource}`, /BEGIN|COMMIT|pg_advisory_xact_lock|setInterval|setTimeout/);
});

test("the unchanged Stage 14C CLI contract selects the shared lock-aware runner", () => {
  const cli = readFileSync("scripts/position-history-horizon-populate.cjs", "utf8");
  assert.match(cli, /PositionHistoryHorizonExecutionModule/); assert.match(cli, /PositionHistoryHorizonExecutionRunnerService/);
  assert.match(cli, /"--to"/); assert.match(cli, /"--max-windows"/); assert.match(cli, /"--exclude-provider-disabled"/); assert.doesNotMatch(cli, /--max-vehicles|--unlimited/);
});
