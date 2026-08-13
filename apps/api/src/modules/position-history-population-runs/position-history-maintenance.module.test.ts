import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PositionHistoryMaintenanceModule } from "./position-history-maintenance.module";
import { PositionHistoryMaintenanceService } from "./position-history-maintenance.service";

test("maintenance module composes config, database, Stage 14 planner and durable creation only", () => {
  const imports = (Reflect.getMetadata("imports", PositionHistoryMaintenanceModule) as Array<{ name: string }>).map((value) => value.name);
  assert.deepEqual(imports, ["ApiConfigModule", "DatabaseModule", "PositionHistoryHorizonModule", "PositionHistoryPopulationRunModule"]);
  assert.deepEqual(Reflect.getMetadata("providers", PositionHistoryMaintenanceModule), [PositionHistoryMaintenanceService]);
  assert.deepEqual(Reflect.getMetadata("exports", PositionHistoryMaintenanceModule), [PositionHistoryMaintenanceService]);
  const app = readFileSync("src/app.module.ts", "utf8");
  assert.match(app, /PositionHistoryMaintenanceModule/);
  const moduleSource = readFileSync("src/modules/position-history-population-runs/position-history-maintenance.module.ts", "utf8");
  const serviceSource = readFileSync("src/modules/position-history-population-runs/position-history-maintenance.service.ts", "utf8");
  assert.doesNotMatch(`${moduleSource}\n${serviceSource}`, /@Controller|@Post|@Get|maintenance\/run|system-run|run-now/);
});
