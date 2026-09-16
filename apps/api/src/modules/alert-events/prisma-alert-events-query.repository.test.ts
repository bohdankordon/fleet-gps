import assert from "node:assert/strict";
import test from "node:test";
import { AlertEventSpeedZone, AlertEventStatus, AlertEventType, AlertNotificationStatus, type PrismaClient } from "../../generated/prisma/client";
import type { DatabaseService } from "../database";
import type { AlertEventsQueryParams } from "./alert-events-query-params";
import { MAX_OPEN_ALERT_MAP_EVENTS } from "./alert-events-query.repository";
import { alertEventsReadSelectForTests, PrismaAlertEventsQueryRepository } from "./prisma-alert-events-query.repository";
import { UNRESTRICTED_VEHICLE_SCOPE } from "../vehicle-access/vehicle-access.service";

const VEHICLE_ID = "00000000-0000-4000-8000-000000000001";
const AT = new Date("2026-08-08T10:00:00.000Z");
const baseParams: AlertEventsQueryParams = { status: undefined, type: undefined, vehicleId: undefined, group: { kind: "ALL" }, limit: 2, cursor: undefined };

function stored(id: string, confirmedAt = AT) {
  return {
    id, type: AlertEventType.SPEEDING, status: AlertEventStatus.OPEN, confirmedAt, resolvedAt: null,
    speedZone: AlertEventSpeedZone.CITY, confirmationSpeedKph: 70, lastSpeedKph: 70, peakSpeedKph: 70, speedThresholdKph: 60,
    confirmationTraveledDistanceMeters: null, lastTraveledDistanceMeters: null, minimumTraveledDistanceMeters: null, distanceThresholdMeters: null, durationThresholdMinutes: null,
    vehicle: { id: VEHICLE_ID, name: "Vehicle", group: null }, notificationOutbox: [{ status: AlertNotificationStatus.PENDING }],
  };
}

test("uses bounded newest-first deterministic pagination and selects only the read model", async () => {
  let args: unknown; let reads = 0; let writes = 0;
  const rows = [stored("00000000-0000-4000-8000-000000000009"), stored("00000000-0000-4000-8000-000000000008"), stored("00000000-0000-4000-8000-000000000007")];
  const client = { alertEvent: {
    findMany: async (value: unknown) => { reads += 1; args = value; return rows; },
    create: async () => { writes += 1; }, update: async () => { writes += 1; }, updateMany: async () => { writes += 1; }, delete: async () => { writes += 1; },
  } } as unknown as PrismaClient;
  const result = await new PrismaAlertEventsQueryRepository({ getClient: () => client } as DatabaseService).list(baseParams, UNRESTRICTED_VEHICLE_SCOPE);
  assert.equal(reads, 1); assert.equal(writes, 0); assert.equal(result.hasMore, true); assert.equal(result.rows.length, 2);
  const query = args as { orderBy: unknown; take: number; select: Record<string, unknown>; where: unknown };
  assert.deepEqual(query.orderBy, [{ confirmedAt: "desc" }, { id: "desc" }]); assert.equal(query.take, 3); assert.deepEqual(query.where, {});
  assert.equal(query.select, alertEventsReadSelectForTests);
  for (const forbidden of ["externalDeviceId", "latitude", "longitude", "dedupeKey", "activeKey", "createdAt", "updatedAt", "confirmations", "lockToken", "lastErrorCode", "attemptCount"]) assert.equal(forbidden in query.select, false, forbidden);
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
  for (const filter of filters) await repository.list({ ...baseParams, ...filter }, UNRESTRICTED_VEHICLE_SCOPE);
  assert.deepEqual(seen.map((value) => (value as { where: unknown }).where), filters);
});

test("uses the cursor's openedAt and UUID as a strict keyset boundary", async () => {
  let args: unknown;
  const cursor = { openedAt: AT, id: "00000000-0000-4000-8000-000000000008" };
  const client = { alertEvent: { findMany: async (value: unknown) => { args = value; return []; } } } as unknown as PrismaClient;
  await new PrismaAlertEventsQueryRepository({ getClient: () => client } as DatabaseService).list({ ...baseParams, status: "OPEN", type: "SPEEDING", cursor }, UNRESTRICTED_VEHICLE_SCOPE);
  assert.deepEqual((args as { where: unknown }).where, { status: "OPEN", type: "SPEEDING", OR: [{ confirmedAt: { lt: AT } }, { confirmedAt: AT, id: { lt: cursor.id } }] });
});

test("summary performs one read-only OPEN groupBy and maps zero or mixed groups", async () => {
  const calls: unknown[] = [];
  let groups: readonly unknown[] = [];
  const client = { alertEvent: { groupBy: async (args: unknown) => { calls.push(args); return groups; } } } as unknown as PrismaClient;
  const repository = new PrismaAlertEventsQueryRepository({ getClient: () => client } as DatabaseService);
  assert.deepEqual(await repository.getOpenSummary(UNRESTRICTED_VEHICLE_SCOPE), { speeding: 0, inactivity: 0 });
  groups = [{ type: AlertEventType.INACTIVITY, _count: { _all: 4 } }, { type: AlertEventType.SPEEDING, _count: { _all: 2 } }];
  assert.deepEqual(await repository.getOpenSummary(UNRESTRICTED_VEHICLE_SCOPE), { speeding: 2, inactivity: 4 });
  assert.deepEqual(calls, [
    { by: ["type"], where: { status: "OPEN" }, _count: { _all: true } },
    { by: ["type"], where: { status: "OPEN" }, _count: { _all: true } },
  ]);
});

test("OPEN map uses one bounded deterministic read with an explicit coordinate-free select", async () => {
  let args: unknown;
  let reads = 0;
  let writes = 0;
  const mapRow = { type: AlertEventType.SPEEDING, confirmedAt: AT, vehicle: { id: VEHICLE_ID, name: "Vehicle", group: null } };
  const rows = Array.from({ length: MAX_OPEN_ALERT_MAP_EVENTS + 1 }, () => mapRow);
  const client = { alertEvent: {
    findMany: async (value: unknown) => { reads += 1; args = value; return rows; },
    create: async () => { writes += 1; }, update: async () => { writes += 1; }, updateMany: async () => { writes += 1; }, delete: async () => { writes += 1; },
  } } as unknown as PrismaClient;
  const result = await new PrismaAlertEventsQueryRepository({ getClient: () => client } as DatabaseService).getOpenMapSnapshot(UNRESTRICTED_VEHICLE_SCOPE);
  assert.equal(reads, 1);
  assert.equal(writes, 0);
  assert.equal(result.rows.length, MAX_OPEN_ALERT_MAP_EVENTS);
  assert.equal(result.exceededLimit, true);
  assert.deepEqual(args, {
    where: { status: AlertEventStatus.OPEN },
    orderBy: [{ vehicle: { name: "asc" } }, { vehicleId: "asc" }, { type: "asc" }, { confirmedAt: "asc" }, { id: "asc" }],
    take: MAX_OPEN_ALERT_MAP_EVENTS + 1,
    select: { type: true, confirmedAt: true, vehicle: { select: { id: true, name: true, group: { select: { id: true, name: true, color: true } } } } },
  });
  const serialized = JSON.stringify(args);
  for (const forbidden of ["currentState", "latitude", "longitude", "activeKey", "dedupeKey", "notificationOutbox", "confirmations", "createdAt", "updatedAt"]) assert.equal(serialized.includes(forbidden), false, forbidden);
});

test("OPEN map includes alerts regardless of whether the related vehicle has CurrentState", async () => {
  const row = { type: AlertEventType.INACTIVITY, confirmedAt: AT, vehicle: { id: VEHICLE_ID, name: "No position", group: null } };
  const client = { alertEvent: { findMany: async () => [row] } } as unknown as PrismaClient;
  assert.deepEqual(await new PrismaAlertEventsQueryRepository({ getClient: () => client } as DatabaseService).getOpenMapSnapshot(UNRESTRICTED_VEHICLE_SCOPE), { rows: [row], exceededLimit: false });
});


test("opening range is inclusive/exclusive and composes with status, type, vehicle and strict keyset", async () => {
  const queries: { where: Record<string, unknown>; orderBy: unknown; take: number }[] = [];
  const client = { alertEvent: { findMany: async (args: typeof queries[number]) => { queries.push(args); return []; } } } as unknown as PrismaClient;
  const repository = new PrismaAlertEventsQueryRepository({ getClient: () => client } as DatabaseService);
  const from = new Date("2026-08-01T00:00:00Z"); const to = new Date("2026-09-01T00:00:00Z"); const cursor = { openedAt: AT, id: VEHICLE_ID };
  await repository.list({ ...baseParams, from }, UNRESTRICTED_VEHICLE_SCOPE); await repository.list({ ...baseParams, to }, UNRESTRICTED_VEHICLE_SCOPE);
  await repository.list({ ...baseParams, from, to, status: "RESOLVED", type: "INACTIVITY", vehicleId: VEHICLE_ID, cursor }, UNRESTRICTED_VEHICLE_SCOPE);
  assert.deepEqual(queries[0]?.where, { confirmedAt: { gte: from } });
  assert.deepEqual(queries[1]?.where, { confirmedAt: { lt: to } });
  assert.deepEqual(queries[2]?.where, { confirmedAt: { gte: from, lt: to }, status: "RESOLVED", type: "INACTIVITY", vehicleId: VEHICLE_ID, OR: [{ confirmedAt: { lt: AT } }, { confirmedAt: AT, id: { lt: VEHICLE_ID } }] });
  assert.deepEqual(queries[2]?.orderBy, [{ confirmedAt: "desc" }, { id: "desc" }]); assert.equal(queries[2]?.take, 3);
  assert.equal(alertEventsReadSelectForTests.lastObservedAt, true);
});
test("vehicle options use only vehicles represented in Events and select identity without writes", async () => {
  let query: unknown;
  const client = { vehicle: { findMany: async (args: unknown) => { query = args; return [{ id: VEHICLE_ID, name: "DEMO", group: null }]; } } } as unknown as PrismaClient;
  const result = await new PrismaAlertEventsQueryRepository({ getClient: () => client } as DatabaseService).getVehicleOptions(UNRESTRICTED_VEHICLE_SCOPE);
  assert.deepEqual(query, { where: { alertEvents: { some: {} } }, select: { id: true, name: true, group: { select: { id: true, name: true, color: true } } }, orderBy: [{ name: "asc" }, { id: "asc" }] });
  assert.deepEqual(result, [{ vehicleId: VEHICLE_ID, vehicleName: "DEMO", group: null }]);
});

test("investigation direct-ID read is SPEEDING-only and composes Product Vehicle Access in the same query", async () => {
  let query: unknown;
  const eventId = "00000000-0000-4000-8000-000000000099";
  const scope = { kind: "FILTERED" as const, where: { id: { equals: VEHICLE_ID } } };
  const client = { alertEvent: { findFirst: async (args: unknown) => { query = args; return null; } } } as unknown as PrismaClient;
  const result = await new PrismaAlertEventsQueryRepository({ getClient: () => client } as DatabaseService).findSpeedingInvestigation(eventId, scope);
  assert.equal(result, null);
  assert.deepEqual(query, {
    where: { AND: [{ id: eventId, type: AlertEventType.SPEEDING }, { vehicle: scope.where }] },
    select: { id: true, type: true, vehicleId: true, confirmedAt: true, confirmationLatitude: true, confirmationLongitude: true, confirmationSpeedKph: true, speedThresholdKph: true, speedZone: true },
  });
});
