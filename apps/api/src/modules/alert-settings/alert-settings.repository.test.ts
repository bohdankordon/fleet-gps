import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "../../generated/prisma/client";
import type { DatabaseService } from "../database/database.service";
import { AlertSettingsRepository } from "./alert-settings.repository";
import { AlertSettingsStateError } from "./alert-settings.types";

test("reads only the ApplicationSettings singleton without writes", async () => {
  let input: unknown;
  const client = { applicationSettings: { findUnique: async (value: unknown) => { input = value; return { speedRuleEnabled: true, inactivityRuleEnabled: true, citySpeedLimitKph: 50, outsideCitySpeedLimitKph: 90, speedToleranceKph: 10, speedingConfirmationUpdates: 2, inactivityDistanceMeters: 300, inactivityDurationMinutes: 60, timezone: "Europe/Kyiv", cityGeofenceGeoJson: null, updatedAt: new Date() }; } } } as unknown as PrismaClient;
  const result = await new AlertSettingsRepository({ getClient: () => client } as unknown as DatabaseService).getSingleton();
  assert.equal(result.timezone, "Europe/Kyiv");
  assert.deepEqual(input, { where: { id: 1 }, select: { speedRuleEnabled: true, inactivityRuleEnabled: true, citySpeedLimitKph: true, outsideCitySpeedLimitKph: true, speedToleranceKph: true, speedingConfirmationUpdates: true, inactivityDistanceMeters: true, inactivityDurationMinutes: true, timezone: true, cityGeofenceGeoJson: true, updatedAt: true } });
});

test("maps missing and database failure to safe state errors", async () => {
  const missing = new AlertSettingsRepository({ getClient: () => ({ applicationSettings: { findUnique: async () => null } } as unknown as PrismaClient) } as unknown as DatabaseService);
  const failed = new AlertSettingsRepository({ getClient: () => ({ applicationSettings: { findUnique: async () => { throw new Error("postgres secret"); } } } as unknown as PrismaClient) } as unknown as DatabaseService);
  await assert.rejects(missing.getSingleton(), (error: unknown) => error instanceof AlertSettingsStateError && error.kind === "missing");
  await assert.rejects(failed.getSingleton(), (error: unknown) => error instanceof AlertSettingsStateError && error.kind === "database" && !error.message.includes("secret"));
});
