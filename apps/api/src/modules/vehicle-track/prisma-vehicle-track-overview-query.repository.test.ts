import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "../../generated/prisma/client";
import type { DatabaseService } from "../database";
import { PrismaVehicleTrackOverviewQueryRepository } from "./prisma-vehicle-track-overview-query.repository";
import { MAX_CONNECTED_RAW_GAP_SECONDS, MAX_OVERVIEW_POINTS } from "./vehicle-track-overview-query.repository";

const vehicleId = "00000000-0000-4000-8000-000000000001";
const from = new Date("2026-08-01T00:00:00.000Z");
const to = new Date("2026-08-08T00:00:00.000Z");
const at = new Date("2026-08-02T12:00:00.000Z");

function rawPoint(overrides: Record<string, unknown> = {}) {
  return {
    rawPointCount: 1,
    segmentCount: 1,
    qualityWarningCount: 0,
    firstObservedAt: at,
    lastObservedAt: at,
    tooFragmented: false,
    segmentOrdinal: 1,
    segmentRawPointCount: 1,
    segmentFirstObservedAt: at,
    segmentLastObservedAt: at,
    observedAt: at,
    latitude: 49.2,
    longitude: 28.4,
    speedKph: null,
    valid: null,
    outdated: null,
    ...overrides,
  };
}

test("runs one database-side raw segmentation/sampling query in the repeatable-read snapshot", async () => {
  let sql = "";
  let values: readonly unknown[] = [];
  let transactionOptions: unknown;
  const transaction = {
    vehicle: { findUnique: async () => ({ id: vehicleId, name: "Taxi" }) },
    $queryRaw: async (strings: TemplateStringsArray, ...parameters: unknown[]) => {
      sql = strings.join("?");
      values = parameters;
      return [rawPoint()];
    },
  };
  const client = { $transaction: async (callback: (value: typeof transaction) => unknown, options: unknown) => { transactionOptions = options; return callback(transaction); } };
  const repository = new PrismaVehicleTrackOverviewQueryRepository({ getClient: () => client } as unknown as DatabaseService);
  const result = await repository.getOverviewSnapshot(vehicleId, from, to);
  assert.equal(result.points.length, 1);
  assert.deepEqual(result.points[0], {
    segmentOrdinal: 1, segmentRawPointCount: 1, segmentFirstObservedAt: at, segmentLastObservedAt: at,
    observedAt: at, latitude: 49.2, longitude: 28.4, speedKph: null, valid: null, outdated: null,
  });
  assert.deepEqual(transactionOptions, { timeout: 10_000, isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });

  assert.match(sql, /FROM vehicle_position_observations/);
  assert.match(sql, /WHERE vehicle_id = \?::uuid\s+AND observed_at >= \?\s+AND observed_at <= \?/);
  assert.match(sql, /lag\(observed_at\) OVER \(ORDER BY observed_at, fix_fingerprint\)/);
  assert.match(sql, /previous_observed_at > make_interval/);
  assert.match(sql, /sum\(segment_start\) OVER/);
  assert.match(sql, /WHERE NOT mandatory/);
  assert.match(sql, /floor\(/);
  assert.match(sql, /ORDER BY selected\.segment_ordinal, selected\.observed_at, selected\.fix_fingerprint/);
  assert.ok(values.includes(vehicleId));
  assert.ok(values.includes(from));
  assert.ok(values.includes(to));
  assert.ok(values.includes(MAX_CONNECTED_RAW_GAP_SECONDS));
  assert.ok(values.filter((value) => value === MAX_OVERVIEW_POINTS).length >= 2);
});

test("known empty range returns one summary and no point while unknown vehicle skips history SQL", async () => {
  let historyQueries = 0;
  const emptyRow = rawPoint({ rawPointCount: 0, segmentCount: 0, firstObservedAt: null, lastObservedAt: null, segmentOrdinal: null, segmentRawPointCount: null, segmentFirstObservedAt: null, segmentLastObservedAt: null, observedAt: null, latitude: null, longitude: null });
  const knownTransaction = { vehicle: { findUnique: async () => ({ id: vehicleId, name: "Taxi" }) }, $queryRaw: async () => { historyQueries += 1; return [emptyRow]; } };
  const knownClient = { $transaction: async (callback: (value: typeof knownTransaction) => unknown) => callback(knownTransaction) };
  const known = await new PrismaVehicleTrackOverviewQueryRepository({ getClient: () => knownClient } as unknown as DatabaseService).getOverviewSnapshot(vehicleId, from, to);
  assert.equal(known.rawPointCount, 0);
  assert.deepEqual(known.points, []);

  const unknownTransaction = { vehicle: { findUnique: async () => null }, $queryRaw: async () => { historyQueries += 1; return []; } };
  const unknownClient = { $transaction: async (callback: (value: typeof unknownTransaction) => unknown) => callback(unknownTransaction) };
  const unknown = await new PrismaVehicleTrackOverviewQueryRepository({ getClient: () => unknownClient } as unknown as DatabaseService).getOverviewSnapshot(vehicleId, from, to);
  assert.equal(unknown.vehicle, null);
  assert.equal(historyQueries, 1);
});

test("large logical raw result transfers no more than the configured selected-row bound", async () => {
  const last = new Date(at.getTime() + 50_000_000);
  const rows = Array.from({ length: MAX_OVERVIEW_POINTS }, (_, index) => rawPoint({
    rawPointCount: 50_000,
    firstObservedAt: at,
    lastObservedAt: last,
    segmentRawPointCount: 50_000,
    segmentFirstObservedAt: at,
    segmentLastObservedAt: last,
    observedAt: index === MAX_OVERVIEW_POINTS - 1 ? last : new Date(at.getTime() + index),
  }));
  const transaction = { vehicle: { findUnique: async () => ({ id: vehicleId, name: "Taxi" }) }, $queryRaw: async () => rows };
  const client = { $transaction: async (callback: (value: typeof transaction) => unknown) => callback(transaction) };
  const result = await new PrismaVehicleTrackOverviewQueryRepository({ getClient: () => client } as unknown as DatabaseService).getOverviewSnapshot(vehicleId, from, to);
  assert.equal(result.rawPointCount, 50_000);
  assert.equal(result.points.length, MAX_OVERVIEW_POINTS);
});
