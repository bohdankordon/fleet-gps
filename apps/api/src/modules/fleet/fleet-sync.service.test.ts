import assert from "node:assert/strict";
import test from "node:test";
import type { EquGpsDevice, EquGpsPosition } from "@taxi-gps/equgps";
import { EquGpsGatewayService } from "../equgps/equgps-gateway.service";
import { FleetSyncService } from "./fleet-sync.service";
import type { FleetRepository } from "./fleet.repository";
import type { FleetSnapshot } from "./fleet.types";

const devices: readonly EquGpsDevice[] = [{ id: 1, name: "Safe", status: "online", disabled: false, lastUpdate: null }];
const positions: readonly EquGpsPosition[] = [{ deviceId: 1, fixTime: null, valid: true, outdated: false, speedKnots: null, latitude: null, longitude: null }];

test("syncs devices before positions, persists one complete snapshot and returns safe aggregates", async () => {
  const calls: string[] = []; let stored: FleetSnapshot | undefined;
  const gateway = { getDevices: async () => { calls.push("devices"); return devices; }, getLatestPositions: async () => { calls.push("positions"); return positions; } } as unknown as EquGpsGatewayService;
  const repository: FleetRepository = { persistSnapshot: async (snapshot) => { calls.push("repository"); stored = snapshot; return { vehiclesUpserted: snapshot.vehicles.length, currentStatesUpserted: snapshot.vehicles.length }; } };
  const service = new FleetSyncService(gateway, repository, { now: () => new Date("2026-08-05T12:00:00.000Z") });
  const result = await service.syncLatestSnapshot();
  assert.deepEqual(calls, ["devices", "positions", "repository"]);
  assert.equal(stored?.vehicles.length, 1);
  assert.deepEqual(result, { devicesReceived: 1, positionsReceived: 1, vehiclesUpserted: 1, currentStatesUpserted: 1, devicesWithoutPosition: 0, unmatchedPositions: 0, duplicatePositions: 0, invalidDeviceLastUpdateDates: 0, invalidPositionFixDates: 0, fetchedAt: "2026-08-05T12:00:00.000Z" });
  assert.equal("token" in result, false);
});

test("does no work in the constructor, propagates errors and treats syncs as separate operations", async () => {
  let calls = 0;
  const gateway = { getDevices: async () => { calls += 1; return devices; }, getLatestPositions: async () => positions } as unknown as EquGpsGatewayService;
  const repository: FleetRepository = { persistSnapshot: async (snapshot) => ({ vehiclesUpserted: snapshot.vehicles.length, currentStatesUpserted: snapshot.vehicles.length }) };
  const service = new FleetSyncService(gateway, repository, { now: () => new Date("2026-08-05T12:00:00.000Z") });
  assert.equal(calls, 0);
  await service.syncLatestSnapshot(); await service.syncLatestSnapshot();
  assert.equal(calls, 2);
  const failing = new FleetSyncService({ getDevices: async () => { throw new Error("gateway"); } } as unknown as EquGpsGatewayService, repository, { now: () => new Date() });
  await assert.rejects(failing.syncLatestSnapshot());
  const repositoryFailure = new FleetSyncService(gateway, { persistSnapshot: async () => { throw new Error("repository"); } }, { now: () => new Date() });
  await assert.rejects(repositoryFailure.syncLatestSnapshot());
});
