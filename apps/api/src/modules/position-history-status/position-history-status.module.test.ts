import assert from "node:assert/strict";
import test from "node:test";
import { PositionHistoryIngestionStatusService } from "./position-history-ingestion-status.service";
import { PositionHistoryStatusController } from "./position-history-status.controller";
import { PositionHistoryStatusModule } from "./position-history-status.module";

test("runtime status module is read-only database plus Stage 14B planner with one controller", () => {
  const imports = (Reflect.getMetadata("imports", PositionHistoryStatusModule) as Array<{ name: string }>).map((value) => value.name);
  assert.deepEqual(imports, ["DatabaseModule", "PositionHistoryHorizonModule", "PositionHistoryHorizonExecutionLockModule"]);
  // Neither status read can reach a provider: the module imports no provider/execution surface.
  for (const forbidden of ["EquGpsModule", "PositionHistoryHorizonExecutionModule", "PositionHistoryHorizonPopulationModule"]) assert.equal(imports.includes(forbidden), false, forbidden);
  assert.deepEqual(Reflect.getMetadata("controllers", PositionHistoryStatusModule), [PositionHistoryStatusController]);
  assert.deepEqual(Reflect.getMetadata("providers", PositionHistoryStatusModule), [PositionHistoryIngestionStatusService]);
});

test("no stored-observation aggregate is registered on the admin history read path", () => {
  const providers = (Reflect.getMetadata("providers", PositionHistoryStatusModule) ?? []) as readonly unknown[];
  assert.equal(providers.some((provider) => /observation/i.test(String((provider as { name?: string }).name ?? provider))), false);
  assert.deepEqual(Reflect.getMetadata("auth:permissions", PositionHistoryStatusController), ["historyAdmin.view"]);
});
