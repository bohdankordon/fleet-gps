import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "../../generated/prisma/client";
import type { DatabaseService } from "../database";
import { PrismaVehicleTrackQueryRepository } from "./prisma-vehicle-track-query.repository";
import { UNRESTRICTED_VEHICLE_SCOPE } from "../vehicle-access/vehicle-access.service"; import { MAX_TRACK_POINTS } from "./vehicle-track-query.repository";

const vehicleId = "00000000-0000-4000-8000-000000000001";
const from = new Date("2026-08-10T10:00:00.123Z");
const to = new Date("2026-08-11T10:00:00.123Z");

test("reads vehicle and inclusive ordered bounded history in one repeatable-read transaction", async () => {
  const calls: unknown[] = [];
  const point = { observedAt: from, latitude: 49, longitude: 28, speedKph: null, valid: null, outdated: null };
  const transaction = {
    vehicle: { findFirst: async (args: unknown) => { calls.push(["vehicle", args]); return { id: vehicleId, name: "Taxi", group: null }; } },
    vehiclePositionObservation: { findMany: async (args: unknown) => { calls.push(["points", args]); return [point]; } },
  };
  let transactionOptions: unknown;
  const client = { $transaction: async (callback: (value: typeof transaction) => unknown, options: unknown) => { transactionOptions = options; return callback(transaction); } };
  const repository = new PrismaVehicleTrackQueryRepository({ getClient: () => client } as unknown as DatabaseService);
  assert.deepEqual(await repository.getSnapshot(vehicleId, from, to, UNRESTRICTED_VEHICLE_SCOPE), { vehicle: { id: vehicleId, name: "Taxi", group: null }, points: [point] });
  assert.deepEqual(calls, [
    ["vehicle", { where: { id: vehicleId }, select: { id: true, name: true, group: { select: { id: true, name: true, color: true } } } }],
    ["points", { where: { vehicleId, observedAt: { gte: from, lte: to } }, orderBy: [{ observedAt: "asc" }, { fixFingerprint: "asc" }], take: MAX_TRACK_POINTS + 1, select: { observedAt: true, latitude: true, longitude: true, speedKph: true, valid: true, outdated: true } }],
  ]);
  assert.deepEqual(transactionOptions, { timeout: 10_000, isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
});

test("unknown vehicle performs no history query", async () => {
  let pointQueries = 0;
  const transaction = { vehicle: { findFirst: async () => null }, vehiclePositionObservation: { findMany: async () => { pointQueries += 1; return []; } } };
  const client = { $transaction: async (callback: (value: typeof transaction) => unknown) => callback(transaction) };
  const repository = new PrismaVehicleTrackQueryRepository({ getClient: () => client } as unknown as DatabaseService);
  assert.deepEqual(await repository.getSnapshot(vehicleId, from, to, UNRESTRICTED_VEHICLE_SCOPE), { vehicle: null, points: [] });
  assert.equal(pointQueries, 0);
});
