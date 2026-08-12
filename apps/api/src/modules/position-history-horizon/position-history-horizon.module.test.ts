import assert from "node:assert/strict";
import test from "node:test";
import { PositionHistoryHorizonModule } from "./position-history-horizon.module";
import { PositionHistoryHorizonService } from "./position-history-horizon.service";

test("horizon planner module is database-only with no controller, provider, or runtime integration", () => {
  assert.deepEqual((Reflect.getMetadata("imports", PositionHistoryHorizonModule) as Array<{ name: string }>).map((value) => value.name), ["DatabaseModule"]);
  assert.deepEqual(Reflect.getMetadata("exports", PositionHistoryHorizonModule), [PositionHistoryHorizonService]);
  assert.equal(Reflect.getMetadata("controllers", PositionHistoryHorizonModule) ?? null, null);
});
