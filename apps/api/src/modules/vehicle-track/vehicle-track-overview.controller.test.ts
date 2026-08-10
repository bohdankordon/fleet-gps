import assert from "node:assert/strict";
import test from "node:test";
import { HttpException } from "@nestjs/common";
import { VehicleTrackOverviewController } from "./vehicle-track-overview.controller";
import type { VehicleTrackOverviewQueryService } from "./vehicle-track-overview-query.service";
import { VehicleTrackOverviewNotFoundError, VehicleTrackOverviewTooFragmentedError } from "./vehicle-track-overview.types";

const id = "00000000-0000-4000-8000-000000000001";
const response = {
  generatedAt: "2026-08-10T12:00:00.000Z",
  vehicle: { id, name: "Taxi" },
  range: { from: "2026-08-01T00:00:00.000Z", to: "2026-08-08T00:00:00.000Z" },
  summary: { rawPointCount: 0, returnedPointCount: 0, segmentCount: 0, gapCount: 0, qualityWarningCount: 0, firstObservedAt: null, lastObservedAt: null, sampled: true },
  segments: [],
} as const;

function status(expected: number, body: object) {
  return (error: unknown) => error instanceof HttpException
    && error.getStatus() === expected
    && JSON.stringify(error.getResponse()) === JSON.stringify(body);
}

test("rejects malformed UUID and invalid overview ranges before query execution", async () => {
  let calls = 0;
  const controller = new VehicleTrackOverviewController({ getOverview: async () => { calls += 1; return response; } } as unknown as VehicleTrackOverviewQueryService);
  for (const args of [
    ["bad", "2026-08-01T00:00:00Z", "2026-08-02T00:00:00Z"],
    [id, undefined, "2026-08-02T00:00:00Z"],
    [id, "2026-08-01T00:00:00Z", undefined],
    [id, "2026-08-01T00:00:00", "2026-08-02T00:00:00Z"],
    [id, "2026-08-01T00:00:00Z", "2026-08-01T00:00:00Z"],
    [id, "2026-08-02T00:00:00Z", "2026-08-01T00:00:00Z"],
    [id, "2026-08-01T00:00:00Z", "2026-08-08T00:00:00.001Z"],
  ] as const) await assert.rejects(controller.getOverview(args[0], args[1], args[2]), status(400, { statusCode: 400, error: "Bad Request" }));
  assert.equal(calls, 0);
});

test("normalizes UUID and accepts exactly seven days", async () => {
  const calls: unknown[] = [];
  const controller = new VehicleTrackOverviewController({ getOverview: async (...args: unknown[]) => { calls.push(args); return response; } } as unknown as VehicleTrackOverviewQueryService);
  assert.equal(await controller.getOverview(id.toUpperCase(), "2026-08-01T02:00:00+02:00", "2026-08-08T00:00:00Z"), response);
  assert.deepEqual(calls, [[id, new Date("2026-08-01T00:00:00Z"), new Date("2026-08-08T00:00:00Z")]]);
});

test("maps unknown, pathological fragmentation, and internal failures safely", async () => {
  for (const [error, code, body] of [
    [new VehicleTrackOverviewNotFoundError(), 404, { statusCode: 404, error: "Not Found" }],
    [new VehicleTrackOverviewTooFragmentedError(), 422, { statusCode: 422, error: "Unprocessable Entity" }],
    [new Error("database secret"), 500, { statusCode: 500, error: "Internal Server Error" }],
  ] as const) {
    const controller = new VehicleTrackOverviewController({ getOverview: async () => { throw error; } } as unknown as VehicleTrackOverviewQueryService);
    await assert.rejects(controller.getOverview(id, "2030-01-01T00:00:00Z", "2030-01-02T00:00:00Z"), status(code, body));
  }
});
