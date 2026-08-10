import assert from "node:assert/strict";
import test from "node:test";
import { HttpException } from "@nestjs/common";
import { VehicleDetailsController } from "./vehicle-details.controller";
import type { VehicleDetailsQueryService } from "./vehicle-details-query.service";
import { VehicleDetailsNotFoundError } from "./vehicle-details.types";

const ID = "00000000-0000-4000-8000-000000000001";
const response = { generatedAt: "2026-08-10T12:00:00.000Z", vehicle: { id: ID, name: "Taxi" }, currentState: null, today: null, activeAlerts: [], recentEvents: [] } as const;

function status(expected: number, body: object): (error: unknown) => boolean {
  return (error) => error instanceof HttpException && error.getStatus() === expected && JSON.stringify(error.getResponse()) === JSON.stringify(body);
}

test("invalid vehicle UUID returns deterministic safe 400 without calling the query", async () => {
  let calls = 0;
  const controller = new VehicleDetailsController({ getDetails: async () => { calls += 1; return response; } } as unknown as VehicleDetailsQueryService);
  await assert.rejects(controller.getDetails("not-a-uuid"), status(400, { statusCode: 400, error: "Bad Request" }));
  assert.equal(calls, 0);
});

test("valid vehicle UUID is normalized and returns details once", async () => {
  const ids: string[] = [];
  const controller = new VehicleDetailsController({ getDetails: async (id: string) => { ids.push(id); return response; } } as unknown as VehicleDetailsQueryService);
  assert.deepEqual(await controller.getDetails(ID.toUpperCase()), response);
  assert.deepEqual(ids, [ID]);
});

test("unknown vehicle returns safe 404 and internal failures return safe 500", async () => {
  const missing = new VehicleDetailsController({ getDetails: async () => { throw new VehicleDetailsNotFoundError(); } } as unknown as VehicleDetailsQueryService);
  await assert.rejects(missing.getDetails(ID), status(404, { statusCode: 404, error: "Not Found" }));
  const failed = new VehicleDetailsController({ getDetails: async () => { throw new Error("database secret"); } } as unknown as VehicleDetailsQueryService);
  await assert.rejects(failed.getDetails(ID), status(500, { statusCode: 500, error: "Internal Server Error" }));
});
