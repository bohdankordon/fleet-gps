const { randomInt, randomUUID } = require("node:crypto");

const MIGRATION_NAME = "20260808220000_add_alert_notification_outbox";

class RollbackSignal extends Error {}

function assert(condition) {
  if (!condition) throw new Error("alert events smoke assertion");
}

async function main() {
  if (typeof process.env.DATABASE_URL !== "string" || process.env.DATABASE_URL.trim() === "") {
    console.log("alert-events smoke: configuration required");
    process.exitCode = 1;
    return;
  }

  const { PrismaPg } = require("@prisma/adapter-pg");
  const { PrismaClient } = require("../dist/generated/prisma/client");
  const { PrismaAlertEventsRepository } = require("../dist/modules/alert-events/prisma-alert-events.repository");
  const { AlertEventsLifecycleService } = require("../dist/modules/alert-events/alert-events-lifecycle.service");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  let vehicleId;

  try {
    const applied = await prisma.$queryRaw`SELECT 1 FROM "_prisma_migrations" WHERE migration_name = ${MIGRATION_NAME} AND finished_at IS NOT NULL LIMIT 1`;
    if (!Array.isArray(applied) || applied.length !== 1) {
      console.log("alert-events smoke: migration required");
      console.log(`required migration: ${MIGRATION_NAME}`);
      process.exitCode = 1;
      return;
    }

    vehicleId = randomUUID();
    try {
      await prisma.$transaction(async (transaction) => {
        await transaction.vehicle.create({ data: { id: vehicleId, externalDeviceId: randomInt(1_500_000_000, 2_000_000_000), name: "alert-events-smoke", disabled: true } });
        const repository = new PrismaAlertEventsRepository({ getClient: () => transaction }, { telegramNotifications: { enabled: true } });
        const lifecycle = new AlertEventsLifecycleService(repository);
        const confirmedAt = new Date("2026-08-08T10:00:00.000Z");
        const coalescedSpeeding = { type: "SPEEDING", vehicleId, observedAt: new Date("2026-08-08T10:05:00.000Z"), zone: "CITY", speedKph: 80, speedThresholdKph: 60 };

        const created = await lifecycle.openSpeedingEvent({ type: "SPEEDING", vehicleId, observedAt: confirmedAt, zone: "CITY", speedKph: 72, speedThresholdKph: 60 });
        assert(created.outcome === "CREATED");
        assert((await lifecycle.openSpeedingEvent({ type: "SPEEDING", vehicleId, observedAt: confirmedAt, zone: "CITY", speedKph: 72, speedThresholdKph: 60 })).outcome === "ALREADY_EXISTS");
        const coalesced = await lifecycle.openSpeedingEvent(coalescedSpeeding);
        assert(coalesced.outcome === "ALREADY_OPEN" && coalesced.updated === true);
        assert(await transaction.alertEvent.count({ where: { vehicleId, type: "SPEEDING", status: "OPEN" } }) === 1);
        assert(await transaction.alertEventConfirmation.count({ where: { eventId: created.eventId } }) === 2);
        assert((await lifecycle.resolveSpeedingEvent({ type: "SPEEDING", vehicleId, observedAt: new Date("2026-08-08T10:10:00.000Z"), speedKph: 40 })).outcome === "RESOLVED");
        assert((await lifecycle.openSpeedingEvent(coalescedSpeeding)).outcome === "ALREADY_EXISTS");
        assert(await transaction.alertEvent.count({ where: { vehicleId, type: "SPEEDING" } }) === 1);
        assert(await transaction.alertEvent.count({ where: { vehicleId, type: "SPEEDING", status: "OPEN" } }) === 0);
        const inactivity = await lifecycle.openInactivityEvent({ type: "INACTIVITY", vehicleId, observedAt: new Date("2026-08-08T11:00:00.000Z"), traveledDistanceMeters: 10, distanceThresholdMeters: 300, durationThresholdMinutes: 60 });
        assert(inactivity.outcome === "CREATED");
        assert((await lifecycle.resolveInactivityEvent({ type: "INACTIVITY", vehicleId, observedAt: new Date("2026-08-08T12:00:00.000Z"), traveledDistanceMeters: 350 })).outcome === "RESOLVED");
        throw new RollbackSignal();
      }, { timeout: 30_000 });
      throw new Error("alert events smoke rollback missing");
    } catch (error) {
      if (!(error instanceof RollbackSignal)) throw error;
    }

    assert(await prisma.alertEvent.count({ where: { vehicleId } }) === 0);
    assert(await prisma.alertEventConfirmation.count({ where: { event: { vehicleId } } }) === 0);
    assert(await prisma.vehicle.count({ where: { id: vehicleId } }) === 0);
    console.log("alert-events smoke: passed");
    console.log("transaction rollback: verified");
    console.log("speeding lifecycle: verified");
    console.log("inactivity lifecycle: verified");
    console.log("one-open invariant: verified");
    console.log("confirmation receipts: verified");
  } catch (error) {
    console.log(`alert-events smoke: failed (${error instanceof Error ? error.name : "unknown"})`);
    process.exitCode = 1;
  } finally {
    try { await prisma.$disconnect(); }
    catch { process.exitCode = 1; }
  }
}

if (require.main === module) void main().catch(() => {
  console.log("alert-events smoke: failed (unknown)");
  process.exitCode = 1;
});
