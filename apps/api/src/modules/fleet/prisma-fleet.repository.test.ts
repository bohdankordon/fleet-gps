import assert from "node:assert/strict";
import test from "node:test";
import { VehicleStatus, type PrismaClient } from "../../generated/prisma/client";
import { DatabaseService } from "../database/database.service";
import { PrismaFleetRepository } from "./prisma-fleet.repository";
import type { FleetSnapshot } from "./fleet.types";

const fetchedAt = new Date("2026-08-05T12:00:00.000Z");
const snapshot: FleetSnapshot = { vehicles: [{ externalDeviceId: 1, name: "Safe", disabled: false, status: VehicleStatus.ONLINE, externalLastUpdateAt: null, fetchedAt, position: null }, { externalDeviceId: 2, name: "Safe 2", disabled: true, status: VehicleStatus.OFFLINE, externalLastUpdateAt: fetchedAt, fetchedAt, position: { fixTime: fetchedAt, latitude: 49.2, longitude: 28.4, speedKph: 18.52, valid: true, outdated: false } }] };

test("persists a snapshot in one bounded transaction without deleting or touching daily data", async () => {
  let transactions = 0; let timeout = 0; const vehicleUpserts: unknown[] = []; const stateUpserts: unknown[] = []; let dailyTouched = 0; let settingsTouched = 0;
  const transaction = { vehicle: { upsert: async (input: unknown) => { vehicleUpserts.push(input); return { id: `id-${vehicleUpserts.length}` }; } }, vehicleCurrentState: { upsert: async (input: unknown) => { stateUpserts.push(input); return {}; } }, dailyVehicleStat: { findMany: async () => { dailyTouched += 1; return []; } }, applicationSettings: { findMany: async () => { settingsTouched += 1; return []; } } };
  const client = { $transaction: async (callback: (tx: typeof transaction) => Promise<unknown>, options: { timeout: number }) => { transactions += 1; timeout = options.timeout; return callback(transaction); } } as unknown as PrismaClient;
  const database = { getClient: () => client } as unknown as DatabaseService;
  const result = await new PrismaFleetRepository(database).persistSnapshot(snapshot);
  assert.deepEqual(result, { vehiclesUpserted: 2, currentStatesUpserted: 2 });
  assert.equal(transactions, 1); assert.equal(timeout, 30_000); assert.equal(vehicleUpserts.length, 2); assert.equal(stateUpserts.length, 2);
  assert.deepEqual((stateUpserts[0] as { update: object }).update, { status: VehicleStatus.ONLINE, externalLastUpdateAt: null, fetchedAt });
  assert.equal("fixTime" in ((stateUpserts[0] as { update: object }).update), false);
  assert.equal(dailyTouched, 0); assert.equal(settingsTouched, 0);
});
