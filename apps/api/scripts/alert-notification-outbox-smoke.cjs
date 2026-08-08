const assert = require("node:assert/strict");
const { randomInt, randomUUID } = require("node:crypto");

const MIGRATION_NAME = "20260808220000_add_alert_notification_outbox";

class RollbackSignal extends Error {}

async function main() {
  if (typeof process.env.DATABASE_URL !== "string" || process.env.DATABASE_URL.trim() === "") {
    console.log("alert notification outbox smoke: configuration required");
    process.exitCode = 1;
    return;
  }

  const { PrismaPg } = require("@prisma/adapter-pg");
  const { PrismaClient } = require("../dist/generated/prisma/client");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  const vehicleId = randomUUID();
  const nativeFetch = globalThis.fetch;
  let externalRequests = 0;
  let applicationClosed = false;
  let report;

  try {
    const applied = await prisma.$queryRaw`SELECT 1 FROM "_prisma_migrations" WHERE migration_name = ${MIGRATION_NAME} AND finished_at IS NOT NULL LIMIT 1`;
    if (!Array.isArray(applied) || applied.length !== 1) {
      console.log("alert notification outbox smoke: migration required");
      console.log(`required migration: ${MIGRATION_NAME}`);
      process.exitCode = 1;
      return;
    }

    if (typeof nativeFetch === "function") {
      globalThis.fetch = async () => {
        externalRequests += 1;
        throw new Error("Unexpected external request");
      };
    }

    const { PrismaAlertEventsRepository } = require("../dist/modules/alert-events/prisma-alert-events.repository");
    const { AlertEventsLifecycleService } = require("../dist/modules/alert-events/alert-events-lifecycle.service");

    try {
      await prisma.$transaction(async (transaction) => {
        await transaction.vehicle.create({ data: { id: vehicleId, externalDeviceId: randomInt(1_500_000_000, 2_000_000_000), name: "alert-notification-outbox-smoke", disabled: true } });
        const lifecycle = new AlertEventsLifecycleService(new PrismaAlertEventsRepository({ getClient: () => transaction }));

        const firstConfirmation = { type: "SPEEDING", vehicleId, observedAt: new Date("2026-08-08T10:00:00.000Z"), zone: "CITY", speedKph: 72, speedThresholdKph: 60 };
        const coalescedConfirmation = { ...firstConfirmation, observedAt: new Date("2026-08-08T10:05:00.000Z"), speedKph: 80 };
        const first = await lifecycle.openSpeedingEvent(firstConfirmation);
        assert.equal(first.outcome, "CREATED");
        assert.equal(await transaction.alertNotificationOutbox.count({ where: { alertEventId: first.eventId, kind: "ALERT_CONFIRMED" } }), 1);

        const coalesced = await lifecycle.openSpeedingEvent(coalescedConfirmation);
        assert.equal(coalesced.outcome, "ALREADY_OPEN");
        assert.equal(await transaction.alertEventConfirmation.count({ where: { eventId: first.eventId } }), 2);
        assert.equal(await transaction.alertNotificationOutbox.count({ where: { alertEventId: first.eventId } }), 1);

        assert.equal((await lifecycle.resolveSpeedingEvent({ type: "SPEEDING", vehicleId, observedAt: new Date("2026-08-08T10:10:00.000Z"), speedKph: 40 })).outcome, "RESOLVED");
        assert.equal((await lifecycle.openSpeedingEvent(coalescedConfirmation)).outcome, "ALREADY_EXISTS");
        assert.equal(await transaction.alertNotificationOutbox.count({ where: { alertEventId: first.eventId } }), 1);

        const inactivity = await lifecycle.openInactivityEvent({ type: "INACTIVITY", vehicleId, observedAt: new Date("2026-08-08T11:00:00.000Z"), traveledDistanceMeters: 10, distanceThresholdMeters: 300, durationThresholdMinutes: 60 });
        assert.equal(inactivity.outcome, "CREATED");
        assert.equal(await transaction.alertNotificationOutbox.count({ where: { alertEventId: inactivity.eventId, kind: "ALERT_CONFIRMED", status: "PENDING" } }), 1);

        const second = await lifecycle.openSpeedingEvent({ ...firstConfirmation, observedAt: new Date("2026-08-08T11:20:00.000Z"), speedKph: 75 });
        assert.equal(second.outcome, "CREATED");
        assert.notEqual(second.eventId, first.eventId);
        assert.equal(await transaction.alertEvent.count({ where: { vehicleId, type: "SPEEDING" } }), 2);
        assert.equal(await transaction.alertNotificationOutbox.count({ where: { alertEvent: { vehicleId, type: "SPEEDING" } } }), 2);

        report = {
          speedingEvents: await transaction.alertEvent.count({ where: { vehicleId, type: "SPEEDING" } }),
          speedingNotifications: await transaction.alertNotificationOutbox.count({ where: { alertEvent: { vehicleId, type: "SPEEDING" } } }),
          inactivityEvents: await transaction.alertEvent.count({ where: { vehicleId, type: "INACTIVITY" } }),
          inactivityNotifications: await transaction.alertNotificationOutbox.count({ where: { alertEvent: { vehicleId, type: "INACTIVITY" } } }),
        };
        throw new RollbackSignal();
      }, { timeout: 30_000 });
      throw new Error("alert notification outbox smoke rollback missing");
    } catch (error) {
      if (!(error instanceof RollbackSignal)) throw error;
    }

    const temporaryEvents = await prisma.alertEvent.count({ where: { vehicleId } });
    const temporaryReceipts = await prisma.alertEventConfirmation.count({ where: { event: { vehicleId } } });
    const temporaryNotifications = await prisma.alertNotificationOutbox.count({ where: { alertEvent: { vehicleId } } });
    const temporaryVehicles = await prisma.vehicle.count({ where: { id: vehicleId } });
    assert.deepEqual([temporaryEvents, temporaryReceipts, temporaryNotifications, temporaryVehicles], [0, 0, 0, 0]);
    report = { ...report, temporaryEvents, temporaryReceipts, temporaryNotifications, temporaryVehicles };
  } catch (error) {
    console.log(`alert notification outbox smoke: failed (${error instanceof Error ? `${error.name}: ${error.message}` : "unknown"})`);
    process.exitCode = 1;
  } finally {
    globalThis.fetch = nativeFetch;
    try {
      await prisma.$disconnect();
      applicationClosed = true;
    } catch {
      process.exitCode = 1;
    }
  }

  if (process.exitCode !== 1 && report) {
    console.log("alert notification outbox smoke: passed");
    console.log(`SPEEDING events: ${report.speedingEvents}`);
    console.log(`SPEEDING notifications: ${report.speedingNotifications}`);
    console.log(`INACTIVITY events: ${report.inactivityEvents}`);
    console.log(`INACTIVITY notifications: ${report.inactivityNotifications}`);
    console.log("transaction rollback: verified");
    console.log(`temporary AlertEvents: ${report.temporaryEvents}`);
    console.log(`temporary receipts: ${report.temporaryReceipts}`);
    console.log(`temporary notifications: ${report.temporaryNotifications}`);
    console.log(`temporary Vehicles: ${report.temporaryVehicles}`);
    console.log(`external requests: ${externalRequests}`);
    console.log(`application closed: ${applicationClosed}`);
  }
}

if (require.main === module) void main().catch((error) => {
  console.log(`alert notification outbox smoke: failed (${error instanceof Error ? error.name : "unknown"})`);
  process.exitCode = 1;
});
