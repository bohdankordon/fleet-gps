import assert from "node:assert/strict";
import test from "node:test";
import { HttpException } from "@nestjs/common";
import { AlertEventsController } from "./alert-events.controller";
import { AlertEventInvestigationNotFoundError, type AlertEventsQueryService } from "./alert-events-query.service";
const testAuth = { auth: { id: "00000000-0000-4000-8000-000000000001" } } as unknown as import("../auth/auth.types").AuthenticatedRequest;

test("controller returns parsed list and summary responses", async () => {
  let params: unknown;
  const query = {
    list: async (value: unknown) => { params = value; return { items: [], nextCursor: null }; },
    getSummary: async () => ({ open: { total: 0, speeding: 0, inactivity: 0 } }),
    getOpenMap: async () => ({ generatedAt: "2026-08-10T12:00:00.000Z", summary: { totalOpenAlerts: 0, vehiclesWithOpenAlerts: 0, speeding: 0, inactivity: 0 }, vehicles: [] }),
  } as unknown as AlertEventsQueryService;
  const controller = new AlertEventsController(query);
  assert.deepEqual(await controller.list({ status: "OPEN", type: "INACTIVITY", limit: "10" }, testAuth), { items: [], nextCursor: null });
  assert.deepEqual(params, { status: "OPEN", type: "INACTIVITY", vehicleId: undefined, group: { kind: "ALL" }, limit: 10, cursor: undefined });
  assert.deepEqual(await controller.getSummary(testAuth), { open: { total: 0, speeding: 0, inactivity: 0 } });
  assert.deepEqual(await controller.getOpenMap(testAuth), { generatedAt: "2026-08-10T12:00:00.000Z", summary: { totalOpenAlerts: 0, vehiclesWithOpenAlerts: 0, speeding: 0, inactivity: 0 }, vehicles: [] });
});

test("controller returns deterministic safe 400 and 500 payloads", async () => {
  const secret = "raw postgres telegram secret";
  const controller = new AlertEventsController({ list: async () => { throw new Error(secret); }, getSummary: async () => { throw new Error(secret); }, getOpenMap: async () => { throw new Error(secret); } } as unknown as AlertEventsQueryService);
  await assert.rejects(controller.list({ status: "bad" }, testAuth), (error: unknown) => error instanceof HttpException && error.getStatus() === 400 && JSON.stringify(error.getResponse()) === JSON.stringify({ statusCode: 400, error: "Bad Request" }));
  await assert.rejects(controller.list({}, testAuth), (error: unknown) => error instanceof HttpException && error.getStatus() === 500 && !JSON.stringify(error.getResponse()).includes(secret));
  await assert.rejects(controller.getSummary(testAuth), (error: unknown) => error instanceof HttpException && error.getStatus() === 500 && !JSON.stringify(error.getResponse()).includes(secret));
  await assert.rejects(controller.getOpenMap(testAuth), (error: unknown) => error instanceof HttpException && error.getStatus() === 500 && !JSON.stringify(error.getResponse()).includes(secret));
});


test("filter options require events.view and fail with a safe response", async () => {
  assert.deepEqual(Reflect.getMetadata("auth:permissions", AlertEventsController.prototype.getFilterOptions), ["events.view"]);
  const payload = { vehicles: [{ vehicleId: "00000000-0000-4000-8000-000000000001", vehicleName: "DEMO", group: null }], groups: [], hasUngrouped: true };
  const controller = new AlertEventsController({ getFilterOptions: async () => payload } as unknown as AlertEventsQueryService);
  assert.deepEqual(await controller.getFilterOptions(testAuth), payload);
  const failed = new AlertEventsController({ getFilterOptions: async () => { throw new Error("secret"); } } as unknown as AlertEventsQueryService);
  await assert.rejects(failed.getFilterOptions(testAuth), (error: unknown) => error instanceof HttpException && error.getStatus() === 500 && !JSON.stringify(error.getResponse()).includes("secret"));
});

test("investigation requires events.view and uses one non-disclosing 404 for invalid, missing, or inaccessible IDs", async () => {
  assert.deepEqual(Reflect.getMetadata("auth:permissions", AlertEventsController.prototype.getInvestigation), ["events.view"]);
  const payload = { eventId: "00000000-0000-4000-8000-000000000002", type: "SPEEDING" as const, vehicleId: "00000000-0000-4000-8000-000000000003", confirmedAt: "2026-08-08T10:00:00.000Z", confirmationPosition: { latitude: 49.23, longitude: 28.48 }, confirmationSpeedKph: 72, thresholdKph: 60, zone: "CITY" as const };
  const controller = new AlertEventsController({ getSpeedingInvestigation: async () => payload } as unknown as AlertEventsQueryService);
  assert.deepEqual(await controller.getInvestigation(payload.eventId, testAuth), payload);
  await assert.rejects(controller.getInvestigation("not-a-uuid", testAuth), (error: unknown) => error instanceof HttpException && error.getStatus() === 404);
  const hidden = new AlertEventsController({ getSpeedingInvestigation: async () => { throw new AlertEventInvestigationNotFoundError(); } } as unknown as AlertEventsQueryService);
  await assert.rejects(hidden.getInvestigation(payload.eventId, testAuth), (error: unknown) => error instanceof HttpException && error.getStatus() === 404 && JSON.stringify(error.getResponse()) === JSON.stringify({ statusCode: 404, error: "Not Found" }));
});
