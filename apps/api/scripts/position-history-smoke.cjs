const assert = require("node:assert/strict");
const { randomInt } = require("node:crypto");

const MIGRATION_NAME = "20260810120000_add_vehicle_position_observations";

function snapshot(externalDeviceId, latitude = 49.2) {
  const fetchedAt = new Date("2026-08-10T12:01:00.000Z");
  const observedAt = new Date("2026-08-10T12:00:00.000Z");
  const position = { fixTime: observedAt, latitude, longitude: 28.4, speedKph: 18.52, valid: false, outdated: true };
  return {
    vehicles: [{ externalDeviceId, name: "position-history-smoke", disabled: true, status: "OFFLINE", externalLastUpdateAt: observedAt, fetchedAt, position }],
    positionObservations: [{ externalDeviceId, observedAt, latitude, longitude: 28.4, speedKph: 18.52, valid: false, outdated: true, fetchedAt }],
  };
}

async function main() {
  if (typeof process.env.DATABASE_URL !== "string" || process.env.DATABASE_URL.trim() === "") {
    console.log("position history smoke: configuration required"); process.exitCode = 1; return;
  }
  const { PrismaPg } = require("@prisma/adapter-pg");
  const { PrismaClient } = require("../dist/generated/prisma/client");
  const { PrismaFleetRepository } = require("../dist/modules/fleet/prisma-fleet.repository");
  const makeClient = () => new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  const control = makeClient(); const firstClient = makeClient(); const secondClient = makeClient();
  const nativeFetch = globalThis.fetch; let externalRequests = 0; let vehicleId = null;
  const externalDeviceId = randomInt(1_500_000_000, 2_000_000_000);
  let failureExternalDeviceId = randomInt(1_500_000_000, 2_000_000_000);
  while (failureExternalDeviceId === externalDeviceId) failureExternalDeviceId = randomInt(1_500_000_000, 2_000_000_000);
  let baseline; let report;
  try {
    globalThis.fetch = async () => { externalRequests += 1; throw new Error("Unexpected external request"); };
    const applied = await control.$queryRaw`SELECT 1 FROM "_prisma_migrations" WHERE migration_name = ${MIGRATION_NAME} AND finished_at IS NOT NULL LIMIT 1`;
    assert.equal(Array.isArray(applied) && applied.length === 1, true, "position history migration required");
    baseline = { vehicles: await control.vehicle.count(), states: await control.vehicleCurrentState.count(), history: await control.vehiclePositionObservation.count() };
    const firstRepository = new PrismaFleetRepository({ getClient: () => firstClient });
    const secondRepository = new PrismaFleetRepository({ getClient: () => secondClient });
    const concurrent = await Promise.all([firstRepository.persistSnapshot(snapshot(externalDeviceId)), secondRepository.persistSnapshot(snapshot(externalDeviceId))]);
    const vehicle = await control.vehicle.findUnique({ where: { externalDeviceId }, select: { id: true } });
    assert.notEqual(vehicle, null); vehicleId = vehicle.id;
    const afterConcurrent = await control.vehiclePositionObservation.findMany({ where: { vehicleId }, select: { observedAt: true, latitude: true, valid: true, outdated: true, ingestionSource: true, fixFingerprint: true } });
    assert.equal(afterConcurrent.length, 1);
    assert.deepEqual(concurrent.map((result) => result.historyInserted).sort(), [0, 1]);
    assert.equal(afterConcurrent[0].valid, false); assert.equal(afterConcurrent[0].outdated, true); assert.equal(afterConcurrent[0].ingestionSource, "FLEET_SYNC");
    const distinct = await firstRepository.persistSnapshot(snapshot(externalDeviceId, 49.2001));
    const sameTimestampRows = await control.vehiclePositionObservation.findMany({ where: { vehicleId }, select: { fixFingerprint: true, observedAt: true } });
    assert.equal(distinct.historyInserted, 1); assert.equal(sameTimestampRows.length, 2);
    assert.equal(sameTimestampRows[0].observedAt.getTime(), sameTimestampRows[1].observedAt.getTime());
    assert.notEqual(sameTimestampRows[0].fixFingerprint, sameTimestampRows[1].fixFingerprint);
    const faultingClient = {
      $transaction: (callback, options) => control.$transaction((transaction) => callback(new Proxy(transaction, {
        get(target, property, receiver) {
          if (property === "vehiclePositionObservation") return { createMany: async () => { throw new Error("injected history failure"); } };
          return Reflect.get(target, property, receiver);
        },
      })), options),
    };
    const faultingRepository = new PrismaFleetRepository({ getClient: () => faultingClient });
    await assert.rejects(faultingRepository.persistSnapshot(snapshot(failureExternalDeviceId)), /injected history failure/);
    const rolledBackVehicle = await control.vehicle.findUnique({ where: { externalDeviceId: failureExternalDeviceId }, select: { id: true } });
    assert.equal(rolledBackVehicle, null);
    report = { concurrentInserted: concurrent.map((result) => result.historyInserted).sort(), afterConcurrent: afterConcurrent.length, sameTimestampRows: sameTimestampRows.length, atomicRollback: true };
  } finally {
    globalThis.fetch = nativeFetch;
    const fixtureVehicles = await control.vehicle.findMany({ where: { externalDeviceId: { in: [externalDeviceId, failureExternalDeviceId] } }, select: { id: true } });
    const fixtureVehicleIds = fixtureVehicles.map((vehicle) => vehicle.id);
    if (fixtureVehicleIds.length > 0) {
      await control.$transaction(async (transaction) => {
        await transaction.vehiclePositionObservation.deleteMany({ where: { vehicleId: { in: fixtureVehicleIds } } });
        await transaction.vehicleCurrentState.deleteMany({ where: { vehicleId: { in: fixtureVehicleIds } } });
        await transaction.vehicle.deleteMany({ where: { id: { in: fixtureVehicleIds } } });
      });
    }
    const after = { vehicles: await control.vehicle.count(), states: await control.vehicleCurrentState.count(), history: await control.vehiclePositionObservation.count() };
    await Promise.all([control.$disconnect(), firstClient.$disconnect(), secondClient.$disconnect()]);
    if (baseline !== undefined) assert.deepEqual(after, baseline);
    if (report !== undefined) {
      console.log("position history smoke: passed");
      console.log(`concurrent inserted counts: ${report.concurrentInserted.join(",")}`);
      console.log(`rows after concurrent duplicate: ${report.afterConcurrent}`);
      console.log(`same-timestamp distinct rows: ${report.sameTimestampRows}`);
      console.log(`atomic history-failure rollback: ${report.atomicRollback}`);
      console.log("fixture cleanup: verified");
      console.log(`external requests: ${externalRequests}`);
    }
  }
}

if (require.main === module) void main().catch((error) => { console.log(`position history smoke: failed (${error instanceof Error ? error.name : "unknown"})`); process.exitCode = 1; });
