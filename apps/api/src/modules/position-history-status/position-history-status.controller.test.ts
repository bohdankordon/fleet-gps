import assert from "node:assert/strict";
import test from "node:test";
import { HttpException } from "@nestjs/common";
import { PositionHistoryStatusController } from "./position-history-status.controller";
import type { PositionHistoryStatusService } from "./position-history-status.service";

test("requires one strict absolute anchor and passes its exact instant to the read-only service", async () => {
  const seen: string[] = [];
  const service = { inspect: async (to: Date) => { seen.push(to.toISOString()); return { plan: { horizon: { policyDays: 90, from: new Date("2026-05-13T02:00:00Z"), to }, targets: { total: 1, fullSevenDay: 0, remainderDurationMs: 1 }, fleet: { total: 0, providerEligible: 0, providerDisabled: 0 }, targetVehiclePairs: { total: 0, completed: 0, incomplete: 0, providerEligibleIncomplete: 0 }, estimatedRemainingHourlyWindows: 0, slices: [] }, observations: { rowCount: 0, vehiclesWithObservations: 0, firstObservationAt: null, lastObservationAt: null } }; } } as unknown as PositionHistoryStatusService;
  const controller = new PositionHistoryStatusController(service);
  const response = await controller.getStatus("2026-08-11T05:00:00.000+03:00");
  assert.deepEqual(seen, ["2026-08-11T02:00:00.000Z"]);
  assert.equal(response.to, "2026-08-11T02:00:00.000Z");
  for (const value of [undefined, "", "2026-08-11T02:00", "2026-08-11T02:00:00", "not-a-date"]) await assert.rejects(controller.getStatus(value), (error) => error instanceof HttpException && error.getStatus() === 400);
});
