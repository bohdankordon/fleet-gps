import assert from "node:assert/strict";
import test from "node:test";
import { HttpException } from "@nestjs/common";
import type { PositionHistoryHorizonService } from "../position-history-horizon/position-history-horizon.service";
import { PositionHistoryStatusController } from "./position-history-status.controller";

function controller(): { seen: string[]; value: PositionHistoryStatusController } {
  const seen: string[] = [];
  const horizon = { run: async (to: Date) => {
    seen.push(to.toISOString());
    return {
      horizon: { policyDays: 90, from: new Date("2026-05-13T02:00:00Z"), to },
      targets: { total: 1, fullSevenDay: 0, remainderDurationMs: 3_600_000 },
      fleet: { total: 0, providerEligible: 0, providerDisabled: 0 },
      targetVehiclePairs: { total: 0, completed: 0, incomplete: 0, providerEligibleIncomplete: 0 },
      estimatedRemainingHourlyWindows: 0,
      slices: [],
    };
  } } as unknown as PositionHistoryHorizonService;
  return { seen, value: new PositionHistoryStatusController(horizon) };
}

test("horizon plan requires one strict absolute anchor and passes its exact instant to the read-only planner", async () => {
  const { seen, value } = controller();
  const response = await value.getHorizonPlan("2026-08-11T05:00:00.000+03:00");
  assert.deepEqual(seen, ["2026-08-11T02:00:00.000Z"]);
  assert.equal(response.to, "2026-08-11T02:00:00.000Z");
  assert.equal(response.policyDays, 90);
  assert.equal("observations" in response, false);
  for (const bad of [undefined, "", "2026-08-11T02:00", "2026-08-11T02:00:00", "not-a-date"]) await assert.rejects(value.getHorizonPlan(bad), (error) => error instanceof HttpException && error.getStatus() === 400);
});

test("horizon plan maps planner failures to a safe 500 without leaking details", async () => {
  const horizon = { run: async () => { throw new Error("planner connection secret"); } } as unknown as PositionHistoryHorizonService;
  await assert.rejects(new PositionHistoryStatusController(horizon).getHorizonPlan("2026-08-11T02:00:00Z"), (error) => error instanceof HttpException && error.getStatus() === 500 && !JSON.stringify(error.getResponse()).includes("secret"));
});
