const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { randomInt, randomUUID } = crypto;
const { EquGpsHttpError } = require("@taxi-gps/equgps");

async function counts(prisma) {
  const [vehicles, currentStates, dailyStats, positionHistory, checkpoints, alertObservations, alertEvents, outbox, settings] = await Promise.all([
    prisma.vehicle.count(),
    prisma.vehicleCurrentState.count(),
    prisma.dailyVehicleStat.count(),
    prisma.vehiclePositionObservation.count(),
    prisma.vehiclePositionBackfillCheckpoint.count(),
    prisma.alertEvaluationObservation.count(),
    prisma.alertEvent.count(),
    prisma.alertNotificationOutbox.count(),
    prisma.applicationSettings.count(),
  ]);
  return { vehicles, currentStates, dailyStats, positionHistory, checkpoints, alertObservations, alertEvents, outbox, settings };
}

async function protectedDigest(prisma) {
  const tables = [
    ["vehicleCurrentState", "vehicleId"],
    ["dailyVehicleStat", "id"],
    ["alertEvaluationObservation", "id"],
    ["alertEvent", "id"],
    ["alertNotificationOutbox", "id"],
    ["applicationSettings", "id"],
  ];
  const hash = crypto.createHash("sha256");
  for (const [delegate, key] of tables) {
    const rows = await prisma[delegate].findMany({ orderBy: { [key]: "asc" } });
    hash.update(delegate).update(JSON.stringify(rows));
  }
  return hash.digest("hex");
}

function faultingClient(prisma, failure) {
  return new Proxy(prisma, {
    get(target, property, receiver) {
      if (property !== "$transaction") return Reflect.get(target, property, receiver);
      return (callback, options) => target.$transaction((transaction) => callback(new Proxy(transaction, {
        get(transactionTarget, transactionProperty, transactionReceiver) {
          if (transactionProperty !== "vehiclePositionObservation") return Reflect.get(transactionTarget, transactionProperty, transactionReceiver);
          return {
            createMany: async (input) => {
              await transactionTarget.vehiclePositionObservation.createMany(input);
              throw failure;
            },
          };
        },
      })), options);
    },
  });
}

async function main() {
  if (typeof process.env.DATABASE_URL !== "string" || process.env.DATABASE_URL.trim() === "") {
    console.log("fleet backfill smoke: configuration required"); process.exitCode = 1; return;
  }
  const { PrismaPg } = require("@prisma/adapter-pg");
  const { PrismaClient } = require("../dist/generated/prisma/client");
  const { PrismaPositionHistoryBackfillRepository } = require("../dist/modules/position-history-backfill/prisma-position-history-backfill.repository");
  const { PrismaPositionHistoryFleetBackfillRepository } = require("../dist/modules/position-history-backfill/prisma-position-history-fleet-backfill.repository");
  const { PositionHistoryBackfillService } = require("../dist/modules/position-history-backfill/position-history-backfill.service");
  const { PositionHistoryFleetBackfillService } = require("../dist/modules/position-history-backfill/position-history-fleet-backfill.service");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  const nativeFetch = globalThis.fetch;
  let externalRequests = 0;
  const fixtureIds = [randomUUID(), randomUUID()].sort();
  const externalIds = [randomInt(1_500_000_000, 2_000_000_000), randomInt(1_000_000_000, 1_499_999_999)];
  const from = new Date("2001-01-01T00:00:00.000Z");
  const to = new Date("2001-01-01T02:00:00.000Z");
  const target = { from, to };
  let baseline;
  let baselineDigest;
  let report;
  try {
    globalThis.fetch = async () => { externalRequests += 1; throw new Error("Unexpected external request"); };
    baseline = await counts(prisma);
    baselineDigest = await protectedDigest(prisma);
    await prisma.vehicle.createMany({ data: fixtureIds.map((id, index) => ({ id, externalDeviceId: externalIds[index], name: "stage-13a-smoke", disabled: true })) });

    const database = { getClient: () => prisma };
    const persistedFleetRepository = new PrismaPositionHistoryFleetBackfillRepository(database);
    const fleetRepository = {
      inspect: async (value) => (await persistedFleetRepository.inspect(value)).filter((vehicle) => fixtureIds.includes(vehicle.vehicleId)),
    };
    let failSecondVehicle = true;
    let providerCalls = 0;
    const gateway = {
      getHistoricalPositions: async (params) => {
        providerCalls += 1;
        if (failSecondVehicle && params.deviceId === externalIds[1]) throw new EquGpsHttpError(400, "getHistoricalPositions");
        const windowFrom = new Date(params.from);
        const windowTo = new Date(params.to);
        const times = params.deviceId === externalIds[1] && windowFrom.getTime() === from.getTime() + 60 * 60 * 1_000
          ? [windowFrom, new Date(windowFrom.getTime() + 30 * 60 * 1_000)]
          : [windowTo];
        return times.map((fixTime) => ({ deviceId: params.deviceId, fixTime: fixTime.toISOString(), latitude: 49.2, longitude: 28.4, speedKnots: 10, valid: true, outdated: false }));
      },
    };
    const clock = { now: () => new Date("2026-08-11T12:00:00.000Z") };
    const sleeper = { sleep: async () => undefined };
    const normalRepository = new PrismaPositionHistoryBackfillRepository(database);
    const normalEngine = new PositionHistoryBackfillService(gateway, normalRepository, clock, sleeper);
    const fleetService = new PositionHistoryFleetBackfillService(normalEngine, fleetRepository);

    await assert.rejects(fleetService.run(target), EquGpsHttpError);
    const firstCheckpoint = await prisma.vehiclePositionBackfillCheckpoint.findUnique({ where: { vehicleId_rangeFrom_rangeTo: { vehicleId: fixtureIds[0], rangeFrom: from, rangeTo: to } } });
    const secondCheckpointAfterProviderFailure = await prisma.vehiclePositionBackfillCheckpoint.findUnique({ where: { vehicleId_rangeFrom_rangeTo: { vehicleId: fixtureIds[1], rangeFrom: from, rangeTo: to } } });
    const firstHistoryAfterLaterFailure = await prisma.vehiclePositionObservation.count({ where: { vehicleId: fixtureIds[0] } });
    assert.equal(firstCheckpoint?.status, "COMPLETED");
    assert.equal(firstCheckpoint?.nextFrom.getTime(), to.getTime());
    assert.equal(firstHistoryAfterLaterFailure, 2);
    assert.equal(secondCheckpointAfterProviderFailure?.status, "PENDING");
    assert.equal(secondCheckpointAfterProviderFailure?.nextFrom.getTime(), from.getTime());

    failSecondVehicle = false;
    const paused = await fleetService.run(target, { maxWindows: 1 });
    assert.equal(paused.windowsRequested, 1);
    assert.equal(paused.stoppedByBudget, true);
    const partialCheckpoint = await prisma.vehiclePositionBackfillCheckpoint.findUnique({ where: { vehicleId_rangeFrom_rangeTo: { vehicleId: fixtureIds[1], rangeFrom: from, rangeTo: to } } });
    assert.equal(partialCheckpoint?.nextFrom.getTime(), from.getTime() + 60 * 60 * 1_000);
    const secondHistoryBeforeDatabaseFailure = await prisma.vehiclePositionObservation.count({ where: { vehicleId: fixtureIds[1] } });
    assert.equal(secondHistoryBeforeDatabaseFailure, 1);

    const databaseFailure = new Error("injected database failure");
    const failingRepository = new PrismaPositionHistoryBackfillRepository({ getClient: () => faultingClient(prisma, databaseFailure) });
    const failingEngine = new PositionHistoryBackfillService(gateway, failingRepository, clock, sleeper);
    const failingFleetService = new PositionHistoryFleetBackfillService(failingEngine, fleetRepository);
    await assert.rejects(failingFleetService.run(target), (error) => error === databaseFailure);
    const checkpointAfterDatabaseFailure = await prisma.vehiclePositionBackfillCheckpoint.findUnique({ where: { vehicleId_rangeFrom_rangeTo: { vehicleId: fixtureIds[1], rangeFrom: from, rangeTo: to } } });
    const historyAfterDatabaseFailure = await prisma.vehiclePositionObservation.count({ where: { vehicleId: fixtureIds[1] } });
    assert.equal(checkpointAfterDatabaseFailure?.nextFrom.getTime(), partialCheckpoint.nextFrom.getTime());
    assert.equal(historyAfterDatabaseFailure, secondHistoryBeforeDatabaseFailure);
    assert.equal(await prisma.vehiclePositionObservation.count({ where: { vehicleId: fixtureIds[0] } }), firstHistoryAfterLaterFailure);

    const resumed = await fleetService.run(target);
    assert.equal(resumed.partialVehicles, 1);
    assert.equal(resumed.duplicates, 1);
    assert.equal(resumed.inserted, 1);
    const completedCheckpoint = await prisma.vehiclePositionBackfillCheckpoint.findUnique({ where: { vehicleId_rangeFrom_rangeTo: { vehicleId: fixtureIds[1], rangeFrom: from, rangeTo: to } } });
    assert.equal(completedCheckpoint?.status, "COMPLETED");
    assert.equal(completedCheckpoint?.nextFrom.getTime(), to.getTime());

    const callsBeforeReplay = providerCalls;
    const replay = await fleetService.run(target);
    assert.equal(replay.vehiclesAlreadyCompleted, 2);
    assert.equal(replay.providerRequests, 0);
    assert.equal(providerCalls, callsBeforeReplay);
    report = { providerFailureStopped: true, earlierVehiclePreserved: true, partialCursorPreservedOnDatabaseFailure: true, duplicateInserted: resumed.inserted, duplicateSkipped: resumed.duplicates, replayProviderRequests: replay.providerRequests };
  } finally {
    globalThis.fetch = nativeFetch;
    await prisma.$transaction(async (transaction) => {
      await transaction.vehiclePositionObservation.deleteMany({ where: { vehicleId: { in: fixtureIds } } });
      await transaction.vehiclePositionBackfillCheckpoint.deleteMany({ where: { vehicleId: { in: fixtureIds } } });
      await transaction.vehicle.deleteMany({ where: { id: { in: fixtureIds } } });
    });
    const after = await counts(prisma);
    const afterDigest = await protectedDigest(prisma);
    await prisma.$disconnect();
    if (baseline !== undefined) assert.deepEqual(after, baseline);
    if (baselineDigest !== undefined) assert.equal(afterDigest, baselineDigest);
    if (report !== undefined) {
      console.log("fleet backfill smoke: passed");
      console.log(`provider failure stopped fleet: ${report.providerFailureStopped}`);
      console.log(`earlier vehicle preserved: ${report.earlierVehiclePreserved}`);
      console.log(`failed transaction cursor preserved: ${report.partialCursorPreservedOnDatabaseFailure}`);
      console.log(`resume inserted/duplicates: ${report.duplicateInserted}/${report.duplicateSkipped}`);
      console.log(`completed replay provider requests: ${report.replayProviderRequests}`);
      console.log("fixture cleanup and protected-table digest: verified");
      console.log(`external requests: ${externalRequests}`);
    }
  }
}

if (require.main === module) void main().catch((error) => { console.log(`fleet backfill smoke: failed (${error instanceof Error ? error.name : "unknown"})`); process.exitCode = 1; });
