import assert from "node:assert/strict";
import test from "node:test";
import { HttpException } from "@nestjs/common";
import { FleetMapController } from "./fleet-map.controller";
import type { FleetMapQueryService } from "./fleet-map-query.service";

const response = { generatedAt: "2026-08-09T12:00:00.000Z", positionFreshnessSeconds: 300, summary: { totalVehicles: 0, withPosition: 0, withoutPosition: 0, invalidPosition: 0, fresh: 0, stale: 0 }, vehicles: [] } as const;

test("controller returns the fleet map snapshot once", async () => {
  let calls = 0;
  const controller = new FleetMapController({ getSnapshot: async () => { calls += 1; return response; } } as unknown as FleetMapQueryService);
  assert.deepEqual(await controller.getSnapshot(), response);
  assert.equal(calls, 1);
});

test("controller maps internal details to a safe error", async () => {
  const controller = new FleetMapController({ getSnapshot: async () => { throw new Error("private database and coordinates"); } } as unknown as FleetMapQueryService);
  await assert.rejects(controller.getSnapshot(), (error: unknown) => error instanceof HttpException && error.getStatus() === 500 && JSON.stringify(error.getResponse()) === JSON.stringify({ statusCode: 500, error: "Internal Server Error" }));
});
