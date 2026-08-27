import assert from "node:assert/strict";
import test from "node:test";
import { HttpException } from "@nestjs/common";
import { AdminSettingsController } from "./admin-settings.controller";
import { AdminSettingsError } from "./admin-settings.types";

const settings = { timezone: "Europe/Kyiv", minimumDailyDistanceMeters: 500, positionFreshnessSeconds: 300, speedRuleEnabled: true, citySpeedLimitKph: 50, outsideCitySpeedLimitKph: 90, speedToleranceKph: 10, speedingConfirmationUpdates: 2, inactivityRuleEnabled: true, inactivityDistanceMeters: 300, inactivityDurationMinutes: 60, cityGeofence: { configured: false, ringCount: 0, pointCount: 0 }, updatedAt: "2026-08-01T00:00:00.000Z", revision: 7 } as const;
const request = { auth: { id: "00000000-0000-4000-8000-000000000001", login: "admin" } } as any;

test("ADMIN settings controller exposes only its approved response contract including revision", async () => {
  const controller = new AdminSettingsController({ get: async () => settings, update: async () => settings } as any);
  const result = await controller.get(); assert.deepEqual(result, settings); const text = JSON.stringify(result); for (const hidden of ["telegramChatId", "dailyReportMinuteOfDay", "provider", "scheduler", "history", "security"]) assert.equal(text.includes(hidden), false);
});

test("PATCH delegates a typed actor and maps validation and stale revision to safe HTTP errors", async () => {
  let actor: unknown; let body: unknown; const controller = new AdminSettingsController({ get: async () => settings, update: async (nextActor: unknown, nextBody: unknown) => { actor = nextActor; body = nextBody; return settings; } } as any);
  assert.deepEqual(await controller.patch(request, { revision: 7, timezone: "UTC" }), settings); assert.match(JSON.stringify(actor), /admin/); assert.deepEqual(body, { revision: 7, timezone: "UTC" });
  for (const [code, status] of [["INVALID_INPUT", 400], ["CONFLICT", 409]] as const) { const rejected = new AdminSettingsController({ update: async () => { throw new AdminSettingsError(code); } } as any); await assert.rejects(rejected.patch(request, { revision: 7, timezone: "UTC" }), (error: unknown) => error instanceof HttpException && error.getStatus() === status); }
});
