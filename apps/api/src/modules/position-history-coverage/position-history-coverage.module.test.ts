import assert from "node:assert/strict";
import test from "node:test";
import { PositionHistoryCoverageModule } from "./position-history-coverage.module";
import { PositionHistoryCoverageService } from "./position-history-coverage.service";

test("coverage module is database-only and has no provider or application runtime imports", () => {
  assert.deepEqual((Reflect.getMetadata("imports", PositionHistoryCoverageModule) as Array<{ name: string }>).map((value) => value.name), ["DatabaseModule"]);
  assert.deepEqual(Reflect.getMetadata("exports", PositionHistoryCoverageModule), [PositionHistoryCoverageService]);
});
