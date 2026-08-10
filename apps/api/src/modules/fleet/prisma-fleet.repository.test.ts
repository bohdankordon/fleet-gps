import assert from "node:assert/strict";
import test from "node:test";
import { PositionIngestionSource, VehicleStatus, type PrismaClient } from "../../generated/prisma/client";
import { DatabaseService } from "../database/database.service";
import { PrismaFleetRepository } from "./prisma-fleet.repository";
import type { FleetSnapshot } from "./fleet.types";

const fetchedAt = new Date("2026-08-05T12:00:00.000Z");
const observedAt = new Date("2026-08-05T11:59:00.000Z");

function snapshotAt(at: Date = observedAt): FleetSnapshot {
  return {
    vehicles: [{
      externalDeviceId: 2,
      name: "Safe 2",
      disabled: false,
      status: VehicleStatus.ONLINE,
      externalLastUpdateAt: at,
      fetchedAt,
      position: { fixTime: at, latitude: 49.2, longitude: 28.4, speedKph: 18.52, valid: true, outdated: false },
    }],
    positionObservations: [{ externalDeviceId: 2, observedAt: at, latitude: 49.2, longitude: 28.4, speedKph: 18.52, valid: true, outdated: false, fetchedAt }],
  };
}

test("persists current states and one history batch in the same bounded transaction", async () => {
  let transactions = 0;
  let timeout = 0;
  const vehicleUpserts: unknown[] = [];
  const stateUpserts: unknown[] = [];
  const historyCreates: Array<{ data: Array<Record<string, unknown>>; skipDuplicates: boolean }> = [];
  let dailyTouched = 0;
  const transaction = {
    vehicle: { upsert: async (input: unknown) => { vehicleUpserts.push(input); return { id: `id-${vehicleUpserts.length}` }; } },
    vehicleCurrentState: { upsert: async (input: unknown) => { stateUpserts.push(input); return {}; } },
    vehiclePositionObservation: { createMany: async (input: { data: Array<Record<string, unknown>>; skipDuplicates: boolean }) => { historyCreates.push(input); return { count: input.data.length }; } },
    dailyVehicleStat: { findMany: async () => { dailyTouched += 1; return []; } },
  };
  const client = { $transaction: async (callback: (tx: typeof transaction) => Promise<unknown>, options: { timeout: number }) => { transactions += 1; timeout = options.timeout; return callback(transaction); } } as unknown as PrismaClient;
  const database = { getClient: () => client } as unknown as DatabaseService;
  const snapshot: FleetSnapshot = {
    vehicles: [
      { externalDeviceId: 1, name: "Safe", disabled: false, status: VehicleStatus.ONLINE, externalLastUpdateAt: null, fetchedAt, position: null },
      snapshotAt().vehicles[0]!,
    ],
    positionObservations: [
      { externalDeviceId: 1, observedAt: null, latitude: 49, longitude: 28, speedKph: -1, valid: false, outdated: true, fetchedAt },
      snapshotAt().positionObservations[0]!,
      { ...snapshotAt().positionObservations[0]!, latitude: 49.2001, valid: false, outdated: true },
    ],
  };

  const result = await new PrismaFleetRepository(database).persistSnapshot(snapshot);

  assert.deepEqual(result, {
    vehiclesUpserted: 2,
    currentStatesUpserted: 2,
    historyCandidates: 2,
    historyInserted: 2,
    historyDuplicates: 0,
    historySkippedInvalid: 1,
    persistedVehicleIdentities: [{ externalDeviceId: 1, vehicleId: "id-1" }, { externalDeviceId: 2, vehicleId: "id-2" }],
  });
  assert.equal(transactions, 1);
  assert.equal(timeout, 30_000);
  assert.equal(vehicleUpserts.length, 2);
  assert.equal(stateUpserts.length, 2);
  assert.equal(historyCreates.length, 1);
  assert.equal(historyCreates[0]?.skipDuplicates, true);
  assert.equal(historyCreates[0]?.data.length, 2);
  assert.equal(historyCreates[0]?.data.every((row) => row.vehicleId === "id-2"), true);
  assert.equal(historyCreates[0]?.data.every((row) => row.ingestionSource === PositionIngestionSource.FLEET_SYNC), true);
  assert.equal(historyCreates[0]?.data[1]?.valid, false);
  assert.equal(historyCreates[0]?.data[1]?.outdated, true);
  assert.notEqual(historyCreates[0]?.data[0]?.fixFingerprint, historyCreates[0]?.data[1]?.fixFingerprint);
  assert.equal(Object.isFrozen(result.persistedVehicleIdentities), true);
  assert.equal(dailyTouched, 0);
  assert.deepEqual((stateUpserts[0] as { update: object }).update, { status: VehicleStatus.ONLINE, externalLastUpdateAt: null, fetchedAt });
  assert.equal("fixTime" in ((stateUpserts[0] as { update: object }).update), false);
});

test("repeated last-known fix is idempotent while a new fix grows history", async () => {
  const uniqueFixes = new Set<string>();
  let currentStateWrites = 0;
  const transaction = {
    vehicle: { upsert: async () => ({ id: "vehicle-id" }) },
    vehicleCurrentState: { upsert: async () => { currentStateWrites += 1; return {}; } },
    vehiclePositionObservation: {
      createMany: async (input: { data: Array<{ vehicleId: string; fixFingerprint: string }> }) => {
        let count = 0;
        for (const row of input.data) {
          const identity = `${row.vehicleId}:${row.fixFingerprint}`;
          if (uniqueFixes.has(identity)) continue;
          uniqueFixes.add(identity);
          count += 1;
        }
        return { count };
      },
    },
  };
  const client = { $transaction: async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction) } as unknown as PrismaClient;
  const repository = new PrismaFleetRepository({ getClient: () => client } as unknown as DatabaseService);

  const first = await repository.persistSnapshot(snapshotAt());
  const repeated = await repository.persistSnapshot(snapshotAt());
  const next = await repository.persistSnapshot(snapshotAt(new Date(observedAt.getTime() + 60_000)));

  assert.deepEqual([first.historyInserted, repeated.historyInserted, next.historyInserted], [1, 0, 1]);
  assert.deepEqual([first.historyDuplicates, repeated.historyDuplicates, next.historyDuplicates], [0, 1, 0]);
  assert.equal(uniqueFixes.size, 2);
  assert.equal(currentStateWrites, 3);
});

test("different vehicles may persist the same normalized fix identity", async () => {
  const rows: Array<{ vehicleId: string; fixFingerprint: string }> = [];
  let vehicleNumber = 0;
  const transaction = {
    vehicle: { upsert: async () => ({ id: `vehicle-${++vehicleNumber}` }) },
    vehicleCurrentState: { upsert: async () => ({}) },
    vehiclePositionObservation: { createMany: async (input: { data: typeof rows }) => { rows.push(...input.data); return { count: input.data.length }; } },
  };
  const client = { $transaction: async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction) } as unknown as PrismaClient;
  const base = snapshotAt();
  const result = await new PrismaFleetRepository({ getClient: () => client } as unknown as DatabaseService).persistSnapshot({
    vehicles: [base.vehicles[0]!, { ...base.vehicles[0]!, externalDeviceId: 3 }],
    positionObservations: [base.positionObservations[0]!, { ...base.positionObservations[0]!, externalDeviceId: 3 }],
  });
  assert.equal(result.historyInserted, 2);
  assert.equal(rows[0]?.fixFingerprint, rows[1]?.fixFingerprint);
  assert.notEqual(rows[0]?.vehicleId, rows[1]?.vehicleId);
});

test("unexpected history persistence failure fails the atomic snapshot transaction", async () => {
  const failure = new Error("history persistence failed");
  let stateWrites = 0;
  const transaction = {
    vehicle: { upsert: async () => ({ id: "vehicle-id" }) },
    vehicleCurrentState: { upsert: async () => { stateWrites += 1; return {}; } },
    vehiclePositionObservation: { createMany: async () => { throw failure; } },
  };
  let transactionRejected = false;
  const client = {
    $transaction: async (callback: (tx: typeof transaction) => Promise<unknown>) => {
      try { return await callback(transaction); }
      catch (error) { transactionRejected = true; throw error; }
    },
  } as unknown as PrismaClient;
  const repository = new PrismaFleetRepository({ getClient: () => client } as unknown as DatabaseService);
  await assert.rejects(repository.persistSnapshot(snapshotAt()), (error) => error === failure);
  assert.equal(stateWrites, 1);
  assert.equal(transactionRejected, true);
});
