import assert from "node:assert/strict";
import test from "node:test";
import { DailyStatSource, DataQuality, VehicleStatus, type PrismaClient } from "../../generated/prisma/client";
import { DatabaseService } from "../database/database.service";
import { PrismaDashboardQueryRepository } from "./prisma-dashboard-query.repository";

test("reads only settings and a date-filtered dashboard snapshot in one bounded transaction", async () => {
  let settingsReads = 0; let transactions = 0; let options: unknown; let vehicleArgs: unknown;
  const client = {
    applicationSettings: { findUnique: async () => { settingsReads += 1; return { timezone: "Europe/Kyiv", minimumDailyDistanceMeters: 500, positionFreshnessSeconds: 300 }; } },
    $transaction: async (callback: (transaction: { vehicle: { findMany: (args: unknown) => Promise<unknown> } }) => Promise<unknown>, value: unknown) => { transactions += 1; options = value; return callback({ vehicle: { findMany: async (args) => { vehicleArgs = args; return [{ id: "local", name: "Vehicle", disabled: false, currentState: { status: VehicleStatus.ONLINE, externalLastUpdateAt: null, fixTime: null, speedKph: null, valid: null, outdated: null }, dailyStats: [{ distanceMeters: 1, source: DailyStatSource.RUNS, quality: DataQuality.PROVISIONAL, isStale: false, isDegraded: false }] }]; } } }); },
  } as unknown as PrismaClient;
  const repository = new PrismaDashboardQueryRepository({ getClient: () => client } as unknown as DatabaseService);
  assert.deepEqual(await repository.getSettings(), { timezone: "Europe/Kyiv", minimumDailyDistanceMeters: 500, positionFreshnessSeconds: 300 });
  const rows = await repository.getVehiclesForServiceDate("2026-08-05");
  assert.equal(settingsReads, 1); assert.equal(transactions, 1); assert.deepEqual(options, { timeout: 10_000 });
  assert.equal(rows[0]?.dailyStat?.source, DailyStatSource.RUNS);
  const args = vehicleArgs as { select: Record<string, unknown> }; assert.equal("externalDeviceId" in args.select, false); assert.equal("create" in args.select, false);
});

test("rejects a missing ApplicationSettings singleton without exposing database details", async () => {
  const client = { applicationSettings: { findUnique: async () => null } } as unknown as PrismaClient;
  const repository = new PrismaDashboardQueryRepository({ getClient: () => client } as unknown as DatabaseService);
  await assert.rejects(repository.getSettings(), (error: unknown) => error instanceof Error && !error.message.includes("postgres"));
});
