import assert from "node:assert/strict";
import test from "node:test";
import { HttpException } from "@nestjs/common";
import { AlertEventsController } from "./alert-events.controller";
import type { AlertEventsQueryService } from "./alert-events-query.service";

test("controller returns parsed list and summary responses", async () => {
  let params: unknown;
  const query = {
    list: async (value: unknown) => { params = value; return { items: [], nextCursor: null }; },
    getSummary: async () => ({ open: { total: 0, speeding: 0, inactivity: 0 } }),
  } as unknown as AlertEventsQueryService;
  const controller = new AlertEventsController(query);
  assert.deepEqual(await controller.list({ status: "OPEN", type: "INACTIVITY", limit: "10" }), { items: [], nextCursor: null });
  assert.deepEqual(params, { status: "OPEN", type: "INACTIVITY", vehicleId: undefined, limit: 10, cursor: undefined });
  assert.deepEqual(await controller.getSummary(), { open: { total: 0, speeding: 0, inactivity: 0 } });
});

test("controller returns deterministic safe 400 and 500 payloads", async () => {
  const secret = "raw postgres telegram secret";
  const controller = new AlertEventsController({ list: async () => { throw new Error(secret); }, getSummary: async () => { throw new Error(secret); } } as unknown as AlertEventsQueryService);
  await assert.rejects(controller.list({ status: "bad" }), (error: unknown) => error instanceof HttpException && error.getStatus() === 400 && JSON.stringify(error.getResponse()) === JSON.stringify({ statusCode: 400, error: "Bad Request" }));
  await assert.rejects(controller.list({}), (error: unknown) => error instanceof HttpException && error.getStatus() === 500 && !JSON.stringify(error.getResponse()).includes(secret));
  await assert.rejects(controller.getSummary(), (error: unknown) => error instanceof HttpException && error.getStatus() === 500 && !JSON.stringify(error.getResponse()).includes(secret));
});
