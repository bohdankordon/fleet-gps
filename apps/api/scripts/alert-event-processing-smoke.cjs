const { randomInt, randomUUID } = require("node:crypto");

const MIGRATION_NAME = "20260808120000_add_alert_events";

class RollbackSignal extends Error {}

function assert(condition) {
  if (!condition) throw new Error("alert event processing smoke assertion");
}

function speeding(vehicleId, observedAt, overrides = {}) {
  return { vehicleId, observedAt, status: "CONFIRMED", reason: "ABOVE_THRESHOLD", zone: "CITY", speedKph: 72, thresholdKph: 60, consecutiveCount: 2, confirmationRequired: 2, newlyConfirmed: true, ...overrides };
}

function inactivity(vehicleId, observedAt, overrides = {}) {
  return { vehicleId, observedAt, status: "CONFIRMED", reason: "INACTIVITY_CONFIRMED", elapsedMinutes: 60, traveledDistanceMeters: 12, distanceThresholdMeters: 300, durationThresholdMinutes: 60, windowPointCount: 3, newlyConfirmed: true, ...overrides };
}

async function main() {
  if (typeof process.env.DATABASE_URL !== "string" || process.env.DATABASE_URL.trim() === "") {
    console.log("alert event processing smoke: configuration required");
    process.exitCode = 1;
    return;
  }

  const { PrismaPg } = require("@prisma/adapter-pg");
  const { PrismaClient } = require("../dist/generated/prisma/client");
  const { AlertEventProcessorService } = require("../dist/modules/alert-events/alert-event-processor.service");
  const { AlertEventsLifecycleService } = require("../dist/modules/alert-events/alert-events-lifecycle.service");
  const { PrismaAlertEventsRepository } = require("../dist/modules/alert-events/prisma-alert-events.repository");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  const vehicleId = randomUUID();
  let applicationClosed = false;
  let report;

  try {
    const applied = await prisma.$queryRaw`SELECT 1 FROM "_prisma_migrations" WHERE migration_name = ${MIGRATION_NAME} AND finished_at IS NOT NULL LIMIT 1`;
    if (!Array.isArray(applied) || applied.length !== 1) throw new Error("required alert event migration is not applied");

    try {
      await prisma.$transaction(async (transaction) => {
        await transaction.vehicle.create({ data: { id: vehicleId, externalDeviceId: randomInt(1_500_000_000, 2_000_000_000), name: "alert-event-processing-smoke", disabled: true } });
        const repository = new PrismaAlertEventsRepository({ getClient: () => transaction });
        const lifecycle = new AlertEventsLifecycleService(repository);
        const processor = new AlertEventProcessorService(lifecycle);

        const beforeNone = {
          events: await transaction.alertEvent.count({ where: { vehicleId } }),
          confirmations: await transaction.alertEventConfirmation.count({ where: { event: { vehicleId } } }),
        };
        const noneResults = await Promise.all([
          processor.processSpeedingResult(speeding(vehicleId, null, { status: "PENDING", reason: "ABOVE_THRESHOLD", newlyConfirmed: false })),
          processor.processSpeedingResult(speeding(vehicleId, null, { status: "IGNORED", reason: "RULE_DISABLED", newlyConfirmed: false })),
          processor.processInactivityResult(inactivity(vehicleId, null, { status: "COLLECTING", reason: "WINDOW_STARTED", newlyConfirmed: false })),
          processor.processInactivityResult(inactivity(vehicleId, null, { status: "IGNORED", reason: "RULE_DISABLED", newlyConfirmed: false })),
        ]);
        const afterNone = {
          events: await transaction.alertEvent.count({ where: { vehicleId } }),
          confirmations: await transaction.alertEventConfirmation.count({ where: { event: { vehicleId } } }),
        };
        const noneSkipped = noneResults.every((result) => result.action === "NONE" && result.persistenceOutcome === null && result.databaseWriteAttempted === false)
          && beforeNone.events === afterNone.events
          && beforeNone.confirmations === afterNone.confirmations;
        assert(noneSkipped);

        const speedingConfirmed = await processor.processSpeedingResult(speeding(vehicleId, "2026-08-08T10:00:00.000Z"));
        const speedingActive = await processor.processSpeedingResult(speeding(vehicleId, "2026-08-08T10:01:00.000Z", { status: "ACTIVE", reason: "ABOVE_THRESHOLD", speedKph: 80, newlyConfirmed: false }));
        const speedingClear = await processor.processSpeedingResult(speeding(vehicleId, "2026-08-08T10:02:00.000Z", { status: "CLEAR", reason: "BELOW_OR_EQUAL_THRESHOLD", speedKph: 50, newlyConfirmed: false }));
        const speedingReplay = await processor.processSpeedingResult(speeding(vehicleId, "2026-08-08T10:00:00.000Z"));
        assert(speedingConfirmed.action === "OPEN" && speedingConfirmed.persistenceOutcome === "CREATED");
        assert(speedingActive.action === "UPDATE" && speedingActive.persistenceOutcome === "UPDATED");
        assert(speedingClear.action === "RESOLVE" && speedingClear.persistenceOutcome === "RESOLVED");
        assert(speedingReplay.action === "OPEN" && speedingReplay.persistenceOutcome === "ALREADY_EXISTS");

        const firstDistinct = await processor.processSpeedingResult(speeding(vehicleId, "2026-08-08T10:10:00.000Z", { speedKph: 73 }));
        const secondDistinct = await processor.processSpeedingResult(speeding(vehicleId, "2026-08-08T10:11:00.000Z", { speedKph: 75 }));
        const distinctResolve = await processor.processSpeedingResult(speeding(vehicleId, "2026-08-08T10:12:00.000Z", { status: "CLEAR", reason: "BELOW_OR_EQUAL_THRESHOLD", speedKph: 55, newlyConfirmed: false }));
        const secondDistinctReplay = await processor.processSpeedingResult(speeding(vehicleId, "2026-08-08T10:11:00.000Z", { speedKph: 75 }));
        assert(firstDistinct.persistenceOutcome === "CREATED");
        assert(secondDistinct.persistenceOutcome === "ALREADY_OPEN");
        assert(distinctResolve.persistenceOutcome === "RESOLVED");
        assert(secondDistinctReplay.persistenceOutcome === "ALREADY_EXISTS");

        const inactivityConfirmed = await processor.processInactivityResult(inactivity(vehicleId, "2026-08-08T11:00:00.000Z"));
        const inactivityActive = await processor.processInactivityResult(inactivity(vehicleId, "2026-08-08T11:01:00.000Z", { status: "ACTIVE", reason: "INACTIVITY_ACTIVE", traveledDistanceMeters: 8, newlyConfirmed: false }));
        const inactivityClear = await processor.processInactivityResult(inactivity(vehicleId, "2026-08-08T11:02:00.000Z", { status: "CLEAR", reason: "DISTANCE_THRESHOLD_REACHED", traveledDistanceMeters: 350, newlyConfirmed: false }));
        assert(inactivityConfirmed.persistenceOutcome === "CREATED");
        assert(inactivityActive.persistenceOutcome === "UPDATED");
        assert(inactivityClear.persistenceOutcome === "RESOLVED");

        const transactionalEvents = await transaction.alertEvent.count({ where: { vehicleId } });
        const transactionalConfirmations = await transaction.alertEventConfirmation.count({ where: { event: { vehicleId } } });
        assert(transactionalEvents === 3 && transactionalConfirmations === 4);
        report = { speedingConfirmed, speedingActive, speedingClear, speedingReplay, secondDistinct, secondDistinctReplay, inactivityConfirmed, inactivityActive, inactivityClear, noneSkipped, transactionalWritesExercised: true };
        throw new RollbackSignal();
      }, { timeout: 30_000 });
      throw new Error("alert event processing smoke rollback missing");
    } catch (error) {
      if (!(error instanceof RollbackSignal)) throw error;
    }

    const temporaryEvents = await prisma.alertEvent.count({ where: { vehicleId } });
    const temporaryConfirmations = await prisma.alertEventConfirmation.count({ where: { event: { vehicleId } } });
    const temporaryVehicles = await prisma.vehicle.count({ where: { id: vehicleId } });
    assert(temporaryEvents === 0 && temporaryConfirmations === 0 && temporaryVehicles === 0);
    report = { ...report, temporaryEvents, temporaryConfirmations, temporaryVehicles };
  } catch (error) {
    console.log(`alert event processing smoke: failed (${error instanceof Error ? error.name : "unknown"})`);
    process.exitCode = 1;
  } finally {
    try { await prisma.$disconnect(); applicationClosed = true; }
    catch { process.exitCode = 1; }
  }

  if (process.exitCode !== 1 && report) {
    console.log("alert event processing smoke: passed");
    console.log(`speeding confirmed action: ${report.speedingConfirmed.action}`);
    console.log(`speeding confirmed outcome: ${report.speedingConfirmed.persistenceOutcome}`);
    console.log(`speeding active action: ${report.speedingActive.action}`);
    console.log(`speeding active outcome: ${report.speedingActive.persistenceOutcome}`);
    console.log(`speeding clear action: ${report.speedingClear.action}`);
    console.log(`speeding clear outcome: ${report.speedingClear.persistenceOutcome}`);
    console.log(`speeding replay outcome: ${report.speedingReplay.persistenceOutcome}`);
    console.log(`second confirmation outcome: ${report.secondDistinct.persistenceOutcome}`);
    console.log(`second confirmation replay outcome: ${report.secondDistinctReplay.persistenceOutcome}`);
    console.log(`inactivity confirmed outcome: ${report.inactivityConfirmed.persistenceOutcome}`);
    console.log(`inactivity active outcome: ${report.inactivityActive.persistenceOutcome}`);
    console.log(`inactivity clear outcome: ${report.inactivityClear.persistenceOutcome}`);
    console.log(`none actions skipped persistence: ${report.noneSkipped}`);
    console.log(`transactional writes exercised: ${report.transactionalWritesExercised}`);
    console.log("transaction rollback: verified");
    console.log(`temporary alert events after rollback: ${report.temporaryEvents}`);
    console.log(`temporary confirmation receipts after rollback: ${report.temporaryConfirmations}`);
    console.log(`temporary vehicles after rollback: ${report.temporaryVehicles}`);
    console.log("external requests: 0");
    console.log(`application closed: ${applicationClosed}`);
  }
}

if (require.main === module) void main().catch(() => {
  console.log("alert event processing smoke: failed (unknown)");
  process.exitCode = 1;
});
