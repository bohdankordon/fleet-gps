import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PositionHistoryRetentionController } from "./position-history-retention.controller";
import { PositionHistoryRetentionModule } from "./position-history-retention.module";
import { POSITION_HISTORY_HORIZON_EXECUTION_LOCK_KEY } from "../position-history-horizon-execution/position-history-horizon-execution-lock.service";

test("retention runtime composes config, database, and the existing shared mutation-lock module only", () => {
  assert.deepEqual((Reflect.getMetadata("imports", PositionHistoryRetentionModule) as Array<{ name: string }>).map((value) => value.name), ["ApiConfigModule", "DatabaseModule", "AuditModule", "PositionHistoryHorizonExecutionLockModule"]);
  assert.deepEqual(Reflect.getMetadata("controllers", PositionHistoryRetentionModule), [PositionHistoryRetentionController]);
  assert.equal(POSITION_HISTORY_HORIZON_EXECUTION_LOCK_KEY, 1706170003);
});

test("planner remains read-only while execution has no provider, worker, scheduler, durable job, or second lock", () => {
  const service = readFileSync("src/modules/position-history-retention/position-history-retention.service.ts", "utf8");
  const repository = readFileSync("src/modules/position-history-retention/prisma-position-history-retention.repository.ts", "utf8");
  const module = readFileSync("src/modules/position-history-retention/position-history-retention.module.ts", "utf8");
  const combined = `${service}\n${repository}\n${module}`;
  const plannerService = service.slice(0, service.indexOf("public async executeRetention"));
  const plannerRepository = repository.slice(0, repository.indexOf("public countActiveDurableRuns"));
  assert.match(service, /position-history-maintenance-anchor/);
  assert.equal((service.match(/canonicalPositionHistoryMaintenanceAnchor/g) ?? []).length, 2);
  assert.doesNotMatch(combined, /EquGps|Worker|Cron|Interval|1706170004|retention job/i);
  assert.doesNotMatch(module, /PositionHistoryHorizonPopulationModule|PositionHistoryPopulationRunModule/);
  assert.doesNotMatch(plannerService, /delete|executeRetention/i);
  assert.doesNotMatch(plannerRepository, /\b(?:INSERT|UPDATE|DELETE)\b/i);
  assert.doesNotMatch(combined, /pg_try_advisory_lock|pg_advisory_unlock/);
});

test("Stage 19C adds no public automatic trigger, CLI, durable retention job, or second deletion implementation", () => {
  const controller = readFileSync("src/modules/position-history-retention/position-history-retention.controller.ts", "utf8");
  const maintenance = readFileSync("src/modules/position-history-retention/position-history-retention-maintenance.service.ts", "utf8");
  assert.equal((controller.match(/@Post\(/g) ?? []).length, 1);
  assert.equal((controller.match(/@Get\(/g) ?? []).length, 1);
  assert.doesNotMatch(`${controller}\n${maintenance}`, /run-automatic|run-now|retention\/schedule|retention\/trigger|Command|process\.argv|RetentionRun|RetentionJob/);
  assert.doesNotMatch(maintenance, /deleteFullyObsoleteCheckpointBatch|deleteExecutableObservationBatch|DELETE FROM|1706170004/);
});
