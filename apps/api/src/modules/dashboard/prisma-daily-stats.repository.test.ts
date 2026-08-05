import assert from "node:assert/strict";
import test from "node:test";
import { DailyStatSource, DataQuality, type PrismaClient } from "../../generated/prisma/client";
import { DatabaseService } from "../database/database.service";
import { PrismaDailyStatsRepository } from "./prisma-daily-stats.repository";
import type { DailyRunsSnapshot } from "./dashboard.types";

const snapshot: DailyRunsSnapshot = { serviceDate: "2026-08-05", fetchedAt: new Date("2026-08-05T12:00:00.000Z"), runs: [{ externalDeviceId: 1, distanceMeters: 0 }, { externalDeviceId: 2, distanceMeters: 25.5 }, { externalDeviceId: 99, distanceMeters: 1 }] };

function repositoryWith(existing: readonly { id: string; vehicleId: string; source: DailyStatSource; quality: DataQuality }[]) {
  let transactions = 0; let timeout = 0; const creates: unknown[] = []; const updates: unknown[] = []; let settingsWrites = 0; let vehicleWrites = 0; let stateWrites = 0;
  const transaction = {
    vehicle: { findMany: async () => [{ id: "v1", externalDeviceId: 1, disabled: false }, { id: "v2", externalDeviceId: 2, disabled: true }] },
    dailyVehicleStat: { findMany: async () => existing, create: async (value: unknown) => { creates.push(value); }, update: async (value: unknown) => { updates.push(value); } },
    applicationSettings: { update: async () => { settingsWrites += 1; } },
    vehicleCurrentState: { update: async () => { stateWrites += 1; } },
  };
  const client = { $transaction: async (callback: (tx: typeof transaction) => Promise<unknown>, options: { timeout: number }) => { transactions += 1; timeout = options.timeout; return callback(transaction); }, applicationSettings: { findUnique: async () => ({ timezone: "Europe/Kyiv" }) }, vehicle: { update: async () => { vehicleWrites += 1; } } } as unknown as PrismaClient;
  return { repository: new PrismaDailyStatsRepository({ getClient: () => client } as unknown as DatabaseService), result: () => ({ transactions, timeout, creates, updates, settingsWrites, vehicleWrites, stateWrites }) };
}

test("persists matched RUNS in one transaction, allows zero and skips unmatched/missing vehicles", async () => {
  const setup = repositoryWith([]); const result = await setup.repository.persistRunsSnapshot(snapshot); const calls = setup.result();
  assert.deepEqual(result, { dailyStatsUpserted: 2, vehiclesWithoutRun: 0, unmatchedRuns: 1, protectedExactStats: 0 });
  assert.equal(calls.transactions, 1); assert.equal(calls.timeout, 30_000); assert.equal(calls.creates.length, 2); assert.equal(calls.updates.length, 0);
  assert.equal((calls.creates[0] as { data: { distanceMeters: number; quality: DataQuality; source: DailyStatSource } }).data.distanceMeters, 0);
  assert.equal((calls.creates[0] as { data: { quality: DataQuality; source: DailyStatSource } }).data.quality, DataQuality.PROVISIONAL);
  assert.equal(calls.settingsWrites + calls.vehicleWrites + calls.stateWrites, 0);
});

test("counts a disabled local vehicle without a run but does not create a zero statistic", async () => {
  const setup = repositoryWith([]);
  const result = await setup.repository.persistRunsSnapshot({ ...snapshot, runs: [{ externalDeviceId: 1, distanceMeters: 1 }] });
  assert.equal(result.vehiclesWithoutRun, 1);
  assert.equal(setup.result().creates.length, 1);
});

test("protects EXACT, refreshes PROVISIONAL and replaces ESTIMATED with RUNS", async () => {
  const exact = repositoryWith([{ id: "s1", vehicleId: "v1", source: DailyStatSource.MODE1, quality: DataQuality.EXACT }]);
  const exactResult = await exact.repository.persistRunsSnapshot(snapshot); assert.equal(exactResult.protectedExactStats, 1); assert.equal(exact.result().updates.length, 0);
  const provisional = repositoryWith([{ id: "s1", vehicleId: "v1", source: DailyStatSource.RUNS, quality: DataQuality.PROVISIONAL }, { id: "s2", vehicleId: "v2", source: DailyStatSource.HISTORICAL_POSITIONS, quality: DataQuality.ESTIMATED }]);
  const provisionalResult = await provisional.repository.persistRunsSnapshot(snapshot); const calls = provisional.result();
  assert.equal(provisionalResult.dailyStatsUpserted, 2); assert.equal(calls.creates.length, 0); assert.equal(calls.updates.length, 2);
  const first = calls.updates[0] as { data: { movementDurationSeconds: null; maxSpeedKph: null; source: DailyStatSource; quality: DataQuality } };
  assert.equal(first.data.source, DailyStatSource.RUNS); assert.equal(first.data.quality, DataQuality.PROVISIONAL); assert.equal(first.data.movementDurationSeconds, null); assert.equal(first.data.maxSpeedKph, null);
});

test("reads only singleton timezone and fails safely when it is absent", async () => {
  const setup = repositoryWith([]); assert.equal(await setup.repository.getTimezone(), "Europe/Kyiv");
  const missing = new PrismaDailyStatsRepository({ getClient: () => ({ applicationSettings: { findUnique: async () => null } } as unknown as PrismaClient) } as unknown as DatabaseService);
  await assert.rejects(missing.getTimezone());
});
