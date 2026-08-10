import assert from "node:assert/strict";
import test from "node:test";
import { AlertEventSpeedZone, AlertEventStatus, AlertEventType, AlertNotificationStatus, type PrismaClient } from "../../generated/prisma/client";
import type { DatabaseService } from "../database";
import type { AlertEventsQueryParams } from "./alert-events-query-params";
import { MAX_OPEN_ALERT_MAP_EVENTS } from "./alert-events-query.repository";
import { alertEventsReadSelectForTests, PrismaAlertEventsQueryRepository } from "./prisma-alert-events-query.repository";

const VEHICLE_ID = "00000000-0000-4000-8000-000000000001";
const AT = new Date("2026-08-08T10:00:00.000Z");
const baseParams: AlertEventsQueryParams = { status: undefined, type: undefined, vehicleId: undefined, limit: 2, cursor: undefined };

function stored(id: string, confirmedAt = AT) {
  return {
    id, type: AlertEventType.SPEEDING, status: AlertEventStatus.OPEN, confirmedAt, resolvedAt: null,
    speedZone: AlertEventSpeedZone.CITY, confirmationSpeedKph: 70, lastSpeedKph: 70, peakSpeedKph: 70, speedThresholdKph: 60,
    confirmationTraveledDistanceMeters: null, lastTraveledDistanceMeters: null, minimumTraveledDistanceMeters: null, distanceThresholdMeters: null, durationThresholdMinutes: null,
    vehicle: { id: VEHICLE_ID, name: "Vehicle" }, notificationOutbox: [{ status: AlertNotificationStatus.PENDING }],
  };
}

test("uses bounded newest-first deterministic pagination and selects only the read model", async () => {
  let args: unknown; let reads = 0; let writes = 0;
  const rows = [stored("00000000-0000-4000-8000-000000000009"), stored("00000000-0000-4000-8000-000000000008"), stored("00000000-0000-4000-8000-000000000007")];
  const client = { alertEvent: {
    findMany: async (value: unknown) => { reads += 1; args = value; return rows; },
    create: async () => { writes += 1; }, update: async () => { writes += 1; }, updateMany: async () => { writes += 1; }, delete: async () => { writes += 1; },
  } } as unknown as PrismaClient;
  const result = await new PrismaAlertEventsQueryRepository({ getClient: () => client } as DatabaseService).list(baseParams);
  assert.equal(reads, 1); assert.equal(writes, 0); assert.equal(result.hasMore, true); assert.equal(result.rows.length, 2);
  const query = args as { orderBy: unknown; take: number; select: Record<string, unknown>; where: unknown };
  assert.deepEqual(query.orderBy, [{ confirmedAt: "desc" }, { id: "desc" }]); assert.equal(query.take, 3); assert.deepEqual(query.where, {});
  assert.equal(query.select, alertEventsReadSelectForTests);
  for (const forbidden of ["externalDeviceId", "latitude", "longitude", "dedupeKey", "activeKey", "lastObservedAt", "createdAt", "updatedAt", "confirmations", "lockToken", "lastErrorCode", "attemptCount"]) assert.equal(forbidden in query.select, false, forbidden);
  assert.deepEqual(query.select.notificationOutbox, { where: { kind: "ALERT_CONFIRMED" }, take: 1, select: { status: true } });
});

test("pushes OPEN, RESOLVED, SPEEDING, INACTIVITY, combined, and vehicle filters into Prisma", async () => {
  const seen: unknown[] = [];
  const client = { alertEvent: { findMany: async (args: unknown) => { seen.push(args); return []; } } } as unknown as PrismaClient;
  const repository = new PrismaAlertEventsQueryRepository({ getClient: () => client } as DatabaseService);
  const filters = [
    { status: "OPEN" as const }, { status: "RESOLVED" as const }, { type: "SPEEDING" as const }, { type: "INACTIVITY" as const },
    { status: "OPEN" as const, type: "INACTIVITY" as const }, { vehicleId: VEHICLE_ID },
  ];
  for (const filter of filters) await repository.list({ ...baseParams, ...filter });
  assert.deepEqual(seen.map((value) => (value as { where: unknown }).where), filters);
});

test("uses the cursor's openedAt and UUID as a strict keyset boundary", async () => {
  let args: unknown;
  const cursor = { openedAt: AT, id: "00000000-0000-4000-8000-000000000008" };
  const client = { alertEvent: { findMany: async (value: unknown) => { args = value; return []; } } } as unknown as PrismaClient;
  await new PrismaAlertEventsQueryRepository({ getClient: () => client } as DatabaseService).list({ ...baseParams, status: "OPEN", type: "SPEEDING", cursor });
  assert.deepEqual((args as { where: unknown }).where, { status: "OPEN", type: "SPEEDING", OR: [{ confirmedAt: { lt: AT } }, { confirmedAt: AT, id: { lt: cursor.id } }] });
});

test("summary performs one read-only OPEN groupBy and maps zero or mixed groups", async () => {
  const calls: unknown[] = [];
  let groups: readonly unknown[] = [];
  const client = { alertEvent: { groupBy: async (args: unknown) => { calls.push(args); return groups; } } } as unknown as PrismaClient;
  const repository = new PrismaAlertEventsQueryRepository({ getClient: () => client } as DatabaseService);
  assert.deepEqual(await repository.getOpenSummary(), { speeding: 0, inactivity: 0 });
  groups = [{ type: AlertEventType.INACTIVITY, _count: { _all: 4 } }, { type: AlertEventType.SPEEDING, _count: { _all: 2 } }];
  assert.deepEqual(await repository.getOpenSummary(), { speeding: 2, inactivity: 4 });
  assert.deepEqual(calls, [
    { by: ["type"], where: { status: "OPEN" }, _count: { _all: true } },
    { by: ["type"], where: { status: "OPEN" }, _count: { _all: true } },
  ]);
});

test("OPEN map uses one bounded deterministic read with an explicit coordinate-free select", async () => {
  let args: unknown;
  let reads = 0;
  let writes = 0;
  const mapRow = { type: AlertEventType.SPEEDING, confirmedAt: AT, vehicle: { id: VEHICLE_ID, name: "Vehicle" } };
  const rows = Array.from({ length: MAX_OPEN_ALERT_MAP_EVENTS + 1 }, () => mapRow);
  const client = { alertEvent: {
    findMany: async (value: unknown) => { reads += 1; args = value; return rows; },
    create: async () => { writes += 1; }, update: async () => { writes += 1; }, updateMany: async () => { writes += 1; }, delete: async () => { writes += 1; },
  } } as unknown as PrismaClient;
  const result = await new PrismaAlertEventsQueryRepository({ getClient: () => client } as DatabaseService).getOpenMapSnapshot();
  assert.equal(reads, 1);
  assert.equal(writes, 0);
  assert.equal(result.rows.length, MAX_OPEN_ALERT_MAP_EVENTS);
  assert.equal(result.exceededLimit, true);
  assert.deepEqual(args, {
    where: { status: AlertEventStatus.OPEN },
    orderBy: [{ vehicle: { name: "asc" } }, { vehicleId: "asc" }, { type: "asc" }, { confirmedAt: "asc" }, { id: "asc" }],
    take: MAX_OPEN_ALERT_MAP_EVENTS + 1,
    select: { type: true, confirmedAt: true, vehicle: { select: { id: true, name: true } } },
  });
  const serialized = JSON.stringify(args);
  for (const forbidden of ["currentState", "latitude", "longitude", "activeKey", "dedupeKey", "notificationOutbox", "confirmations", "createdAt", "updatedAt"]) assert.equal(serialized.includes(forbidden), false, forbidden);
});

test("OPEN map includes alerts regardless of whether the related vehicle has CurrentState", async () => {
  const row = { type: AlertEventType.INACTIVITY, confirmedAt: AT, vehicle: { id: VEHICLE_ID, name: "No position" } };
  const client = { alertEvent: { findMany: async () => [row] } } as unknown as PrismaClient;
  assert.deepEqual(await new PrismaAlertEventsQueryRepository({ getClient: () => client } as DatabaseService).getOpenMapSnapshot(), { rows: [row], exceededLimit: false });
});
