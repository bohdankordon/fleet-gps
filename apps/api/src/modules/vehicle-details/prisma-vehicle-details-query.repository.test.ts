import assert from "node:assert/strict";
import test from "node:test";
import { AlertEventStatus, AlertNotificationKind, Prisma, type PrismaClient } from "../../generated/prisma/client";
import type { DatabaseService } from "../database";
import { PrismaVehicleDetailsQueryRepository, vehicleDetailsEventProjectionSelectForTests } from "./prisma-vehicle-details-query.repository";
import { RECENT_VEHICLE_ALERT_EVENTS_LIMIT } from "./vehicle-details-read-models";
import { UNRESTRICTED_VEHICLE_SCOPE } from "../vehicle-access/vehicle-access.service"; import { VehicleDetailsStateError } from "./vehicle-details.types";

const ID = "00000000-0000-4000-8000-000000000001";
const DATE = new Date("2026-07-01T00:00:00.000Z");

function harness(vehicle: object | null = { id: ID, name: "Taxi", disabled: false, currentState: null, dailyStats: [] }, active: readonly object[] = [], recent: readonly object[] = []) {
  const calls: { settings?: unknown; raw?: readonly unknown[]; vehicle?: unknown; alerts: unknown[]; options?: unknown; transactions: number } = { alerts: [], transactions: 0 };
  const transaction = {
    applicationSettings: { findUnique: async (args: unknown) => { calls.settings = args; return { timezone: "Europe/Kyiv", positionFreshnessSeconds: 300 }; } },
    $queryRaw: async (...args: readonly unknown[]) => { calls.raw = args; return [{ serviceDate: DATE }]; },
    vehicle: { findFirst: async (args: unknown) => { calls.vehicle = args; return vehicle; } },
    alertEvent: { findMany: async (args: unknown) => { calls.alerts.push(args); return calls.alerts.length === 1 ? active : recent; } },
  };
  const client = { $transaction: async (callback: (value: typeof transaction) => Promise<unknown>, options: unknown) => { calls.transactions += 1; calls.options = options; return callback(transaction); } } as unknown as PrismaClient;
  return { repository: new PrismaVehicleDetailsQueryRepository({ getClient: () => client } as DatabaseService), calls };
}

test("reads one consistent bounded snapshot with four entity reads, explicit selects, and no N+1", async () => {
  const active = [{ type: "SPEEDING", confirmedAt: new Date("2026-06-30T20:00:00.000Z") }];
  const recent = [{ id: "event" }];
  const { repository, calls } = harness(undefined, active, recent);
  const result = await repository.getSnapshot(ID, UNRESTRICTED_VEHICLE_SCOPE);
  assert.equal(calls.transactions, 1);
  assert.deepEqual(calls.options, { timeout: 10_000, isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  assert.deepEqual(calls.settings, { where: { id: 1 }, select: { timezone: true, positionFreshnessSeconds: true } });
  assert.ok(String((calls.raw?.[0] as readonly string[] | undefined)?.join(" ")).includes("CURRENT_TIMESTAMP AT TIME ZONE"));
  assert.equal(calls.raw?.[1], "Europe/Kyiv");
  assert.deepEqual(calls.vehicle, {
    where: { id: ID },
    select: {
      id: true, name: true, disabled: true,
      group: { select: { id: true, name: true } },
      currentState: { select: { status: true, fixTime: true, latitude: true, longitude: true, speedKph: true, valid: true, outdated: true } },
      dailyStats: { where: { serviceDate: DATE }, take: 1, select: { distanceMeters: true, movementDurationSeconds: true, maxSpeedKph: true, source: true, quality: true, isStale: true, isDegraded: true } },
    },
  });
  assert.deepEqual(calls.alerts, [
    { where: { vehicleId: ID, status: AlertEventStatus.OPEN }, orderBy: [{ type: "asc" }, { confirmedAt: "asc" }, { id: "asc" }], take: 3, select: { type: true, confirmedAt: true } },
    { where: { vehicleId: ID }, orderBy: [{ confirmedAt: "desc" }, { id: "desc" }], take: RECENT_VEHICLE_ALERT_EVENTS_LIMIT, select: vehicleDetailsEventProjectionSelectForTests },
  ]);
  assert.deepEqual(result.activeAlerts, active);
  assert.deepEqual(result.recentEvents, recent);
  const serialized = JSON.stringify({ vehicle: calls.vehicle, alerts: calls.alerts });
  for (const forbidden of ["externalDeviceId", "externalLastUpdateAt", "fetchedAt", "activeKey", "dedupeKey", "lastObservedAt", "createdAt", "updatedAt", "confirmations", "lockToken", "attemptCount", "lastErrorCode"]) assert.equal(serialized.includes(forbidden), false, forbidden);
  assert.deepEqual(vehicleDetailsEventProjectionSelectForTests.notificationOutbox, { where: { kind: AlertNotificationKind.ALERT_CONFIRMED }, take: 1, select: { status: true } });
});

test("unknown vehicle stops before alert reads and returns the consistent not-found snapshot", async () => {
  const { repository, calls } = harness(null);
  const result = await repository.getSnapshot(ID, UNRESTRICTED_VEHICLE_SCOPE);
  assert.equal(result.vehicle, null);
  assert.deepEqual(result.activeAlerts, []);
  assert.deepEqual(result.recentEvents, []);
  assert.equal(calls.alerts.length, 0);
});

test("active alerts are hard-guarded while recent events are fixed at ten newest-first", async () => {
  const active = [{}, {}, {}];
  const recent = Array.from({ length: RECENT_VEHICLE_ALERT_EVENTS_LIMIT }, (_, index) => ({ id: String(index) }));
  const result = await harness(undefined, active, recent).repository.getSnapshot(ID, UNRESTRICTED_VEHICLE_SCOPE);
  assert.equal(result.activeAlerts.length, 2);
  assert.equal(result.activeAlertsExceededLimit, true);
  assert.equal(result.recentEvents.length, 10);
});

test("missing settings or invalid database operational date fails safely", async () => {
  const transactionMissing = { applicationSettings: { findUnique: async () => null } };
  const clientMissing = { $transaction: async (callback: (value: typeof transactionMissing) => Promise<unknown>) => callback(transactionMissing) } as unknown as PrismaClient;
  await assert.rejects(new PrismaVehicleDetailsQueryRepository({ getClient: () => clientMissing } as DatabaseService).getSnapshot(ID, UNRESTRICTED_VEHICLE_SCOPE), VehicleDetailsStateError);

  const transactionDate = { applicationSettings: { findUnique: async () => ({ timezone: "Europe/Kyiv", positionFreshnessSeconds: 300 }) }, $queryRaw: async () => [{ serviceDate: "2026-07-01" }] };
  const clientDate = { $transaction: async (callback: (value: typeof transactionDate) => Promise<unknown>) => callback(transactionDate) } as unknown as PrismaClient;
  await assert.rejects(new PrismaVehicleDetailsQueryRepository({ getClient: () => clientDate } as DatabaseService).getSnapshot(ID, UNRESTRICTED_VEHICLE_SCOPE), VehicleDetailsStateError);
});
