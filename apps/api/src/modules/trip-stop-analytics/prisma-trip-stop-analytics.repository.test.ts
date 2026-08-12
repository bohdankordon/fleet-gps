import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "../../generated/prisma/client";
import type { DatabaseService } from "../database/database.service";
import { PrismaTripStopAnalyticsRepository } from "./prisma-trip-stop-analytics.repository";

const from = new Date("2026-08-01T00:00:00Z");
const to = new Date("2026-08-02T00:00:00Z");

test("reads one vehicle and one deterministic inclusive observation projection without writes", async () => {
  let writes = 0;
  let transactionOptions: unknown;
  let findManyArguments: unknown;
  const transaction = {
    vehicle: { findUnique: async () => ({ id: "00000000-0000-4000-8000-000000000001", name: "Vehicle" }), update: async () => { writes += 1; } },
    vehiclePositionObservation: {
      findMany: async (arguments_: unknown) => { findManyArguments = arguments_; return [{ observedAt: from, fixFingerprint: "a", latitude: 49, longitude: 28, speedKph: null, valid: false, outdated: true }]; },
      create: async () => { writes += 1; },
      update: async () => { writes += 1; },
      delete: async () => { writes += 1; },
    },
  };
  const client = { $transaction: async (callback: (value: typeof transaction) => unknown, options: unknown) => { transactionOptions = options; return callback(transaction); } } as unknown as PrismaClient;
  const repository = new PrismaTripStopAnalyticsRepository({ getClient: () => client } as DatabaseService);
  const result = await repository.getSnapshot("00000000-0000-4000-8000-000000000001", { from, to });
  assert.equal(writes, 0);
  assert.equal(result.observations.length, 1);
  assert.deepEqual(findManyArguments, {
    where: { vehicleId: "00000000-0000-4000-8000-000000000001", observedAt: { gte: from, lte: to } },
    orderBy: [{ observedAt: "asc" }, { fixFingerprint: "asc" }],
    select: { observedAt: true, fixFingerprint: true, latitude: true, longitude: true, speedKph: true, valid: true, outdated: true },
  });
  assert.deepEqual(transactionOptions, { timeout: 30_000, isolationLevel: "RepeatableRead" });
});

test("unknown vehicle returns immediately without an observation query", async () => {
  let observationReads = 0;
  const transaction = { vehicle: { findUnique: async () => null }, vehiclePositionObservation: { findMany: async () => { observationReads += 1; return []; } } };
  const client = { $transaction: async (callback: (value: typeof transaction) => unknown) => callback(transaction) } as unknown as PrismaClient;
  const result = await new PrismaTripStopAnalyticsRepository({ getClient: () => client } as DatabaseService).getSnapshot("00000000-0000-4000-8000-000000000001", { from, to });
  assert.equal(result.vehicle, null);
  assert.equal(observationReads, 0);
});

