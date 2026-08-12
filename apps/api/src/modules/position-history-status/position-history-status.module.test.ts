import assert from "node:assert/strict";
import test from "node:test";
import { PositionHistoryStatusController } from "./position-history-status.controller";
import { PositionHistoryStatusModule } from "./position-history-status.module";

test("runtime status module is read-only database plus Stage 14B planner with one controller", () => {
  assert.deepEqual((Reflect.getMetadata("imports", PositionHistoryStatusModule) as Array<{ name: string }>).map((value) => value.name), ["DatabaseModule", "PositionHistoryHorizonModule"]);
  assert.deepEqual(Reflect.getMetadata("controllers", PositionHistoryStatusModule), [PositionHistoryStatusController]);
});
