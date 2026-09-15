import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "../../generated/prisma/client";
import { DatabaseService } from "../database/database.service";
import { MAX_FLEET_MAP_VEHICLES } from "./fleet-map-query.repository";
import { FleetMapQueryInternalError } from "./fleet-map.types";
import { PrismaFleetMapQueryRepository } from "./prisma-fleet-map-query.repository";
import { UNRESTRICTED_VEHICLE_SCOPE } from "../vehicle-access/vehicle-access.service";

test("reads one bounded deterministic snapshot with explicit safe selects and no writes", async () => {
  let transactions = 0;
  let settingsArgs: unknown;
  let vehicleArgs: unknown;
  let transactionOptions: unknown;
  const transaction = {
    applicationSettings: { findUnique: async (args: unknown) => { settingsArgs = args; return { positionFreshnessSeconds: 300 }; } },
    vehicle: { findMany: async (args: unknown) => { vehicleArgs = args; return [{ id: "id", name: "Taxi", group: null, currentState: null }]; } },
  };
  const client = {
    $transaction: async (callback: (value: typeof transaction) => Promise<unknown>, options: unknown) => {
      transactions += 1;
      transactionOptions = options;
      return callback(transaction);
    },
  } as unknown as PrismaClient;
  const repository = new PrismaFleetMapQueryRepository({ getClient: () => client } as unknown as DatabaseService);
  assert.deepEqual(await repository.getSnapshot(UNRESTRICTED_VEHICLE_SCOPE), { positionFreshnessSeconds: 300, vehicles: [{ id: "id", name: "Taxi", group: null, currentState: null }] });
  assert.equal(transactions, 1);
  assert.deepEqual(transactionOptions, { timeout: 10_000 });
  assert.deepEqual(settingsArgs, { where: { id: 1 }, select: { positionFreshnessSeconds: true } });
  assert.deepEqual(vehicleArgs, {
    where: {},
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: MAX_FLEET_MAP_VEHICLES + 1,
    select: {
      id: true,
      name: true,
      group: { select: { id: true, name: true, color: true } },
      currentState: { select: { fixTime: true, latitude: true, longitude: true, speedKph: true, valid: true, outdated: true } },
    },
  });
  const serialized = JSON.stringify(vehicleArgs);
  for (const forbidden of ["externalDeviceId", "disabled", "status", "externalLastUpdateAt", "fetchedAt", "dailyStats", "alertEvents", "create", "update", "upsert", "delete"]) assert.equal(serialized.includes(forbidden), false);
});

test("rejects a missing settings singleton and a fleet beyond the hard guard", async () => {
  const createRepository = (settings: object | null, vehicles: readonly object[]) => {
    const transaction = { applicationSettings: { findUnique: async () => settings }, vehicle: { findMany: async () => vehicles } };
    const client = { $transaction: async (callback: (value: typeof transaction) => Promise<unknown>) => callback(transaction) } as unknown as PrismaClient;
    return new PrismaFleetMapQueryRepository({ getClient: () => client } as unknown as DatabaseService);
  };
  await assert.rejects(createRepository(null, []).getSnapshot(UNRESTRICTED_VEHICLE_SCOPE), FleetMapQueryInternalError);
  await assert.rejects(createRepository({ positionFreshnessSeconds: 300 }, Array.from({ length: MAX_FLEET_MAP_VEHICLES + 1 }, () => ({}))).getSnapshot(UNRESTRICTED_VEHICLE_SCOPE), FleetMapQueryInternalError);
});
