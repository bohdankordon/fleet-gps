import assert from "node:assert/strict";
import test from "node:test";
import type { EquGpsDevice, EquGpsPosition } from "@taxi-gps/equgps";
import { EquGpsGatewayService } from "../equgps/equgps-gateway.service";
import type { FleetAlertIngestionService } from "./fleet-alert-ingestion.service";
import { FleetSyncService } from "./fleet-sync.service";
import type { FleetRepository } from "./fleet.repository";
import type { FleetSnapshot } from "./fleet.types";

const vehicleId = "11111111-1111-4111-8111-111111111111";
const devices: readonly EquGpsDevice[] = [{ id: 1, name: "Safe", status: "online", disabled: false, lastUpdate: null }];
const positions: readonly EquGpsPosition[] = [{ deviceId: 1, fixTime: null, valid: true, outdated: false, speedKnots: null, latitude: null, longitude: null }];
const zeroAlerts = Object.freeze({ alertCandidates: 0, alertProcessed: 0, alertAlreadyProcessed: 0, alertSkipped: 0 });

function persisted(snapshot: FleetSnapshot) {
  return {
    vehiclesUpserted: snapshot.vehicles.length,
    currentStatesUpserted: snapshot.vehicles.length,
    persistedVehicleIdentities: snapshot.vehicles.map((vehicle) => ({ externalDeviceId: vehicle.externalDeviceId, vehicleId })),
  };
}

function bridge(run: FleetAlertIngestionService["ingestSnapshot"] = async () => zeroAlerts): FleetAlertIngestionService {
  return { ingestSnapshot: run } as FleetAlertIngestionService;
}

test("syncs devices before positions, persists one complete snapshot and returns safe aggregates", async () => {
  const calls: string[] = []; let stored: FleetSnapshot | undefined;
  const gateway = { getDevices: async () => { calls.push("devices"); return devices; }, getLatestPositions: async () => { calls.push("positions"); return positions; } } as unknown as EquGpsGatewayService;
  const repository: FleetRepository = { persistSnapshot: async (snapshot) => { calls.push("repository"); stored = snapshot; return persisted(snapshot); } };
  const alerts = bridge(async () => { calls.push("alerts"); return zeroAlerts; });
  const service = new FleetSyncService(gateway, repository, { now: () => new Date("2026-08-05T12:00:00.000Z") }, alerts);
  const result = await service.syncLatestSnapshot();
  assert.deepEqual(calls, ["devices", "positions", "repository", "alerts"]);
  assert.equal(stored?.vehicles.length, 1);
  assert.deepEqual(result, { devicesReceived: 1, positionsReceived: 1, vehiclesUpserted: 1, currentStatesUpserted: 1, devicesWithoutPosition: 0, unmatchedPositions: 0, duplicatePositions: 0, invalidDeviceLastUpdateDates: 0, invalidPositionFixDates: 0, ...zeroAlerts, fetchedAt: "2026-08-05T12:00:00.000Z" });
  for (const unsafe of ["vehicleId", "externalDeviceId", "latitude", "longitude", "journal", "evaluation"]) assert.equal(unsafe in result, false);
});

test("does no work in the constructor and treats syncs as separate operations", async () => {
  let gatewayCalls = 0; let alertCalls = 0;
  const gateway = { getDevices: async () => { gatewayCalls += 1; return devices; }, getLatestPositions: async () => positions } as unknown as EquGpsGatewayService;
  const repository: FleetRepository = { persistSnapshot: async (snapshot) => persisted(snapshot) };
  const service = new FleetSyncService(gateway, repository, { now: () => new Date("2026-08-05T12:00:00.000Z") }, bridge(async () => { alertCalls += 1; return zeroAlerts; }));
  assert.equal(gatewayCalls, 0); assert.equal(alertCalls, 0);
  await service.syncLatestSnapshot(); await service.syncLatestSnapshot();
  assert.equal(gatewayCalls, 2); assert.equal(alertCalls, 2);
});

test("starts alert ingestion only after snapshot persistence has completed", async () => {
  let resolvePersistence: (value: ReturnType<typeof persisted>) => void = () => undefined;
  let alertCalls = 0;
  const repository: FleetRepository = { persistSnapshot: (snapshot) => new Promise((resolve) => { resolvePersistence = () => resolve(persisted(snapshot)); }) };
  const service = new FleetSyncService(
    { getDevices: async () => devices, getLatestPositions: async () => positions } as unknown as EquGpsGatewayService,
    repository,
    { now: () => new Date("2026-08-05T12:00:00.000Z") },
    bridge(async () => { alertCalls += 1; return zeroAlerts; }),
  );
  const syncing = service.syncLatestSnapshot();
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.equal(alertCalls, 0);
  resolvePersistence({ vehiclesUpserted: 1, currentStatesUpserted: 1, persistedVehicleIdentities: [{ externalDeviceId: 1, vehicleId }] });
  await syncing;
  assert.equal(alertCalls, 1);
});

test("repository failure prevents alert ingestion", async () => {
  const failure = new Error("repository"); let alertCalls = 0;
  const service = new FleetSyncService(
    { getDevices: async () => devices, getLatestPositions: async () => positions } as unknown as EquGpsGatewayService,
    { persistSnapshot: async () => { throw failure; } },
    { now: () => new Date() },
    bridge(async () => { alertCalls += 1; return zeroAlerts; }),
  );
  await assert.rejects(service.syncLatestSnapshot(), (error) => error === failure);
  assert.equal(alertCalls, 0);
});

for (const gatewayFailure of ["devices", "positions"] as const) {
  test(`${gatewayFailure} gateway failure prevents persistence and alert ingestion`, async () => {
    const failure = new Error(gatewayFailure); let repositoryCalls = 0; let alertCalls = 0;
    const gateway = {
      getDevices: async () => { if (gatewayFailure === "devices") throw failure; return devices; },
      getLatestPositions: async () => { if (gatewayFailure === "positions") throw failure; return positions; },
    } as unknown as EquGpsGatewayService;
    const service = new FleetSyncService(gateway, { persistSnapshot: async (snapshot) => { repositoryCalls += 1; return persisted(snapshot); } }, { now: () => new Date() }, bridge(async () => { alertCalls += 1; return zeroAlerts; }));
    await assert.rejects(service.syncLatestSnapshot(), (error) => error === failure);
    assert.equal(repositoryCalls, 0); assert.equal(alertCalls, 0);
  });
}
