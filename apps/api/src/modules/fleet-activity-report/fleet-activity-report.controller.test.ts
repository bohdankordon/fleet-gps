import assert from "node:assert/strict";
import test from "node:test";
import { HttpException } from "@nestjs/common";
import { FleetActivityReportController } from "./fleet-activity-report.controller";
import type { FleetActivityReportService } from "./fleet-activity-report.service";
const from = new Date("2026-10-24T21:00:00Z"); const to = new Date("2026-10-25T22:00:00Z");
const report = { from, to, generatedAt: from, timezone: "Europe/Kyiv", policy: { tripMovementSpeedKph: 5, tripMovementConfirmationSeconds: 60, tripStopConfirmationSeconds: 300, tripDataGapSeconds: 300 }, summary: { vehicleCount: 1, vehiclesWithGps: 0, vehicleWithoutGpsCount: 1, tripCount: 0, totalObservedDistanceMeters: 0, totalTripDurationSeconds: 0, gapCount: 0, totalGapDurationSeconds: 0 }, vehicles: [{ vehicleId: "00000000-0000-4000-8000-000000000001", vehicleName: "Taxi", hasGpsData: false, rawObservationCount: 0, tripCount: 0, observedDistanceMeters: 0, tripDurationSeconds: 0, stopCount: 0, stopDurationSeconds: 0, gapCount: 0, gapDurationSeconds: 0, firstObservationAt: null, lastObservationAt: null }] };
const testAuth = { auth: { id: "00000000-0000-4000-8000-000000000001" } } as unknown as import("../auth/auth.types").AuthenticatedRequest; const bad = (error: unknown) => error instanceof HttpException && error.getStatus() === 400;
test("returns a safe product DTO and accepts exactly 25 absolute hours", async () => { let received: unknown; const controller = new FleetActivityReportController({ getReport: async (range: unknown) => { received = range; return report; } } as unknown as FleetActivityReportService); const response = await controller.getReport(from.toISOString(), to.toISOString(), testAuth); assert.deepEqual(received, { from, to }); assert.equal(response.from, from.toISOString()); assert.equal(response.vehicles[0]?.hasGpsData, false); assert.equal("externalDeviceId" in response.vehicles[0]!, false); });
test("rejects malformed, nonabsolute, reversed, and over-25-hour ranges", async () => { const controller = new FleetActivityReportController({ getReport: async () => report } as unknown as FleetActivityReportService); for (const [a, b] of [["2026-08-01", to.toISOString()], [to.toISOString(), from.toISOString()], [from.toISOString(), new Date(from.getTime() + 25 * 3_600_000 + 1).toISOString()]]) await assert.rejects(controller.getReport(a, b, testAuth), bad); });


test("API accepts an empty half-open interval", async () => {
  let received: unknown;
  const controller = new FleetActivityReportController({ getReport: async (range: unknown) => { received = range; return { ...report, to: from }; } } as unknown as FleetActivityReportService);
  const response = await controller.getReport(from.toISOString(), from.toISOString(), testAuth);
  assert.deepEqual(received, { from, to: from });
  assert.equal(response.from, response.to);
  assert.equal(response.generatedAt, from.toISOString());
  assert.equal(response.timezone, "Europe/Kyiv");
  assert.equal(response.vehicles[0]!.firstObservationAt, null);
});
