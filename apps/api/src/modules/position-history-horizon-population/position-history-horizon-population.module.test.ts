import assert from "node:assert/strict";
import test from "node:test";
import { PositionHistoryHorizonPopulationModule } from "./position-history-horizon-population.module";
import { PositionHistoryHorizonPopulationService } from "./position-history-horizon-population.service";

test("operator population module composes only existing backfill module and has no controller or runtime integration", () => {
  assert.deepEqual((Reflect.getMetadata("imports", PositionHistoryHorizonPopulationModule) as Array<{ name: string }>).map((value) => value.name), ["PositionHistoryBackfillModule"]);
  assert.deepEqual(Reflect.getMetadata("exports", PositionHistoryHorizonPopulationModule), [PositionHistoryHorizonPopulationService]);
  assert.equal(Reflect.getMetadata("controllers", PositionHistoryHorizonPopulationModule) ?? null, null);
});
