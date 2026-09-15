import assert from "node:assert/strict";
import test from "node:test";
import { HttpException } from "@nestjs/common";
import { VehicleTrackController } from "./vehicle-track.controller";
import type { VehicleTrackQueryService } from "./vehicle-track-query.service";
import { VehicleTrackNotFoundError, VehicleTrackTooDenseError } from "./vehicle-track.types";

const testAuth = { auth: { id: "00000000-0000-4000-8000-000000000099" } } as unknown as import("../auth/auth.types").AuthenticatedRequest; const testUserId = "00000000-0000-4000-8000-000000000099"; const id = "00000000-0000-4000-8000-000000000001";
const response = { generatedAt: "2026-08-10T12:00:00.000Z", vehicle: { id, name: "Taxi" }, range: { from: "2026-08-10T00:00:00.000Z", to: "2026-08-11T00:00:00.000Z" }, summary: { pointCount: 0, firstObservedAt: null, lastObservedAt: null }, points: [] } as const;

function status(expected: number, body: object) { return (error: unknown) => error instanceof HttpException && error.getStatus() === expected && JSON.stringify(error.getResponse()) === JSON.stringify(body); }

test("rejects malformed UUID and every invalid range before query execution", async () => {
  let calls = 0;
  const controller = new VehicleTrackController({ getTrack: async () => { calls += 1; return response; } } as unknown as VehicleTrackQueryService);
  for (const args of [["bad", "2026-08-10T00:00:00Z", "2026-08-10T01:00:00Z"], [id, undefined, "2026-08-10T01:00:00Z"], [id, "2026-08-10T00:00:00Z", undefined], [id, "2026-02-30T00:00:00Z", "2026-08-10T01:00:00Z"], [id, "2026-08-10T00:00:00", "2026-08-10T01:00:00Z"], [id, "2026-08-10T00:00:00+24:00", "2026-08-10T01:00:00Z"], [id, "2026-08-10T01:00:00Z", "2026-08-10T01:00:00Z"], [id, "2026-08-10T02:00:00Z", "2026-08-10T01:00:00Z"], [id, "2026-08-10T00:00:00Z", "2026-08-11T00:00:00.001Z"]] as const) await assert.rejects(controller.getTrack(args[0], args[1], args[2], testAuth), status(400, { statusCode: 400, error: "Bad Request" }));
  assert.equal(calls, 0);
});

test("normalizes UUID and offset-equivalent exact 24h range", async () => {
  const calls: unknown[] = [];
  const controller = new VehicleTrackController({ getTrack: async (...args: unknown[]) => { calls.push(args); return response; } } as unknown as VehicleTrackQueryService);
  assert.equal(await controller.getTrack(id.toUpperCase(), "2026-08-10T02:00:00+02:00", "2026-08-11T00:00:00Z", testAuth), response);
  assert.deepEqual(calls, [[id, new Date("2026-08-10T00:00:00Z"), new Date("2026-08-11T00:00:00Z"), testUserId]]);
});

test("maps not found, overflow, and internal failures to safe responses", async () => {
  for (const [error, code, body] of [[new VehicleTrackNotFoundError(), 404, { statusCode: 404, error: "Not Found" }], [new VehicleTrackTooDenseError(), 422, { statusCode: 422, error: "Unprocessable Entity" }], [new Error("database secret"), 500, { statusCode: 500, error: "Internal Server Error" }]] as const) {
    const controller = new VehicleTrackController({ getTrack: async () => { throw error; } } as unknown as VehicleTrackQueryService);
    await assert.rejects(controller.getTrack(id, "2030-01-01T00:00:00Z", "2030-01-01T01:00:00Z", testAuth), status(code, body));
  }
});
