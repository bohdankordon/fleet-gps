import assert from "node:assert/strict";
import test from "node:test";
import { HttpException } from "@nestjs/common";
import { DashboardController } from "./dashboard.controller";
import type { DashboardQueryService } from "./dashboard-query.service";

const response = { serviceDate: "2026-08-05", timezone: "Europe/Kyiv", minimumDailyDistanceMeters: 500, positionFreshnessSeconds: 300, summary: { total: 0, online: 0, offline: 0, unknown: 0, freshPositions: 0, stalePositions: 0, withoutPosition: 0, belowMinimumDistance: 0, withoutDailyStat: 0 }, vehicles: [], generatedAt: "2026-08-05T00:00:00.000Z" } as const;
test("controller returns parsed dashboard data", async () => { const controller = new DashboardController({ getVehicles: async () => response } as unknown as DashboardQueryService); assert.deepEqual(await controller.getVehicles({ search: " x " }), response); });
test("controller returns safe bad request and internal error payloads", async () => {
  const controller = new DashboardController({ getVehicles: async () => { throw new Error("internal secret"); } } as unknown as DashboardQueryService);
  await assert.rejects(controller.getVehicles({ status: "bad" }), (error: unknown) => error instanceof HttpException && error.getStatus() === 400 && JSON.stringify(error.getResponse()) === JSON.stringify({ statusCode: 400, error: "Bad Request" }));
  await assert.rejects(controller.getVehicles({}), (error: unknown) => error instanceof HttpException && error.getStatus() === 500 && !JSON.stringify(error.getResponse()).includes("secret"));
});
