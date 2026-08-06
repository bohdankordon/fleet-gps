import assert from "node:assert/strict";
import test from "node:test";
import { HttpException } from "@nestjs/common";
import { AlertSettingsController } from "./alert-settings.controller";
import type { AlertSettingsService } from "./alert-settings.service";

const response = { speedRuleEnabled: true, inactivityRuleEnabled: true, citySpeedLimitKph: 50, outsideCitySpeedLimitKph: 90, speedToleranceKph: 10, speedingConfirmationUpdates: 2, inactivityDistanceMeters: 300, inactivityDurationMinutes: 60, timezone: "Europe/Kyiv", cityGeofence: { configured: false, geometry: null }, effectiveSpeedThresholds: { cityKph: 60, outsideCityKph: 100 }, updatedAt: "2026-08-06T10:00:00.000Z" } as const;

test("returns the exact public settings contract once", async () => {
  let calls = 0;
  const controller = new AlertSettingsController({ getSettings: async () => { calls += 1; return response; } } as unknown as AlertSettingsService);
  assert.deepEqual(await controller.getSettings(), response);
  assert.equal(calls, 1);
  assert.equal(JSON.stringify(response).includes("outsideKph"), false);
});

test("maps all internal failures to a generic 500 response", async () => {
  const controller = new AlertSettingsController({ getSettings: async () => { throw new Error("private speed value stack"); } } as unknown as AlertSettingsService);
  await assert.rejects(controller.getSettings(), (error: unknown) => error instanceof HttpException && error.getStatus() === 500 && JSON.stringify(error.getResponse()) === JSON.stringify({ statusCode: 500, error: "Internal Server Error" }));
});
