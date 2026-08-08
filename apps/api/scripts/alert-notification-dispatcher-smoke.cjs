const assert = require("node:assert/strict");
const { randomInt, randomUUID } = require("node:crypto");

const MIGRATION_NAME = "20260808230000_add_alert_notification_dispatcher_state";

class RollbackSignal extends Error {}

async function main() {
  if (typeof process.env.DATABASE_URL !== "string" || process.env.DATABASE_URL.trim() === "") {
    console.log("alert notification dispatcher smoke: configuration required");
    process.exitCode = 1;
    return;
  }

  const { PrismaPg } = require("@prisma/adapter-pg");
  const { PrismaClient } = require("../dist/generated/prisma/client");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  const vehicleId = randomUUID();
  const nativeFetch = globalThis.fetch;
  let externalRequests = 0;
  let report;

  try {
    const applied = await prisma.$queryRaw`SELECT 1 FROM "_prisma_migrations" WHERE migration_name = ${MIGRATION_NAME} AND finished_at IS NOT NULL LIMIT 1`;
    if (!Array.isArray(applied) || applied.length !== 1) {
      console.log("alert notification dispatcher smoke: migration required");
      console.log(`required migration: ${MIGRATION_NAME}`);
      process.exitCode = 1;
      return;
    }

    globalThis.fetch = async () => {
      externalRequests += 1;
      throw new Error("Unexpected external request");
    };

    const { AlertNotificationDispatcherService } = require("../dist/modules/alert-notifications/alert-notification-dispatcher.service");
    const { AlertNotificationMessageFormatter } = require("../dist/modules/alert-notifications/alert-notification-message.formatter");
    const { AlertNotificationOutboxRepository } = require("../dist/modules/alert-notifications/alert-notification-outbox.repository");
    const { TelegramTransportError } = require("../dist/modules/alert-notifications/telegram-notification.transport");
    const { PrismaAlertEventsRepository } = require("../dist/modules/alert-events/prisma-alert-events.repository");
    const { AlertEventsLifecycleService } = require("../dist/modules/alert-events/alert-events-lifecycle.service");
    const config = { telegramNotifications: { enabled: true, botToken: "fake-only", chatId: "fake-only" } };

    try {
      await prisma.$transaction(async (transaction) => {
        await transaction.vehicle.create({ data: { id: vehicleId, externalDeviceId: randomInt(1_500_000_000, 2_000_000_000), name: "dispatcher-smoke", disabled: true } });
        const lifecycle = new AlertEventsLifecycleService(new PrismaAlertEventsRepository({ getClient: () => transaction }));
        const repository = new AlertNotificationOutboxRepository({ getClient: () => transaction });
        const formatter = new AlertNotificationMessageFormatter();

        const speed = await lifecycle.openSpeedingEvent({ type: "SPEEDING", vehicleId, observedAt: new Date("2026-08-08T10:00:00.000Z"), zone: "CITY", speedKph: 72, speedThresholdKph: 60 });
        assert.equal(speed.outcome, "CREATED");
        const speedOutbox = await transaction.alertNotificationOutbox.findUniqueOrThrow({ where: { alertEventId_kind: { alertEventId: speed.eventId, kind: "ALERT_CONFIRMED" } } });
        await transaction.alertNotificationOutbox.update({ where: { id: speedOutbox.id }, data: { createdAt: new Date("2000-01-01T00:00:00.000Z"), availableAt: new Date("2000-01-01T00:00:00.000Z") } });
        let successSends = 0;
        const successDispatcher = new AlertNotificationDispatcherService(repository, formatter, { sendAlertConfirmed: async () => {
          successSends += 1;
          const sending = await transaction.alertNotificationOutbox.findUniqueOrThrow({ where: { id: speedOutbox.id } });
          assert.equal(sending.status, "SENDING");
          assert.ok(sending.lockedAt instanceof Date);
          assert.equal(typeof sending.lockToken, "string");
        } }, config);
        assert.deepEqual(await successDispatcher.dispatchBatch(1), { claimed: 1, sent: 1, retryScheduled: 0, failedPermanent: 0, lostLease: 0 });
        const sent = await transaction.alertNotificationOutbox.findUniqueOrThrow({ where: { id: speedOutbox.id } });
        assert.equal(sent.status, "SENT");
        assert.ok(sent.sentAt instanceof Date);
        assert.equal(sent.lockedAt, null);
        assert.equal(sent.lockToken, null);

        const inactivity = await lifecycle.openInactivityEvent({ type: "INACTIVITY", vehicleId, observedAt: new Date("2026-08-08T11:00:00.000Z"), traveledDistanceMeters: 10, distanceThresholdMeters: 300, durationThresholdMinutes: 60 });
        assert.equal(inactivity.outcome, "CREATED");
        const retryOutbox = await transaction.alertNotificationOutbox.findUniqueOrThrow({ where: { alertEventId_kind: { alertEventId: inactivity.eventId, kind: "ALERT_CONFIRMED" } } });
        await transaction.alertNotificationOutbox.update({ where: { id: retryOutbox.id }, data: { createdAt: new Date("2000-01-02T00:00:00.000Z"), availableAt: new Date("2000-01-02T00:00:00.000Z") } });
        const retryDispatcher = new AlertNotificationDispatcherService(repository, formatter, { sendAlertConfirmed: async () => {
          const sending = await transaction.alertNotificationOutbox.findUniqueOrThrow({ where: { id: retryOutbox.id } });
          assert.equal(sending.status, "SENDING");
          throw new TelegramTransportError("NETWORK", true);
        } }, config);
        assert.deepEqual(await retryDispatcher.dispatchBatch(1), { claimed: 1, sent: 0, retryScheduled: 1, failedPermanent: 0, lostLease: 0 });
        const retry = await transaction.alertNotificationOutbox.findUniqueOrThrow({ where: { id: retryOutbox.id } });
        assert.equal(retry.status, "PENDING");
        assert.equal(retry.lastErrorCode, "NETWORK");
        assert.ok(retry.lastAttemptAt instanceof Date);
        assert.ok(retry.availableAt > retry.lastAttemptAt);

        const expiredToken = randomUUID();
        await transaction.alertNotificationOutbox.update({ where: { id: retryOutbox.id }, data: { status: "SENDING", lockedAt: new Date("2000-01-01T00:00:00.000Z"), lockToken: expiredToken, lastErrorCode: null } });
        let reclaimSends = 0;
        const reclaimDispatcher = new AlertNotificationDispatcherService(repository, formatter, { sendAlertConfirmed: async () => { reclaimSends += 1; } }, config);
        assert.deepEqual(await reclaimDispatcher.dispatchBatch(1), { claimed: 1, sent: 1, retryScheduled: 0, failedPermanent: 0, lostLease: 0 });
        const reclaimed = await transaction.alertNotificationOutbox.findUniqueOrThrow({ where: { id: retryOutbox.id } });
        assert.equal(reclaimed.status, "SENT");
        assert.equal(reclaimed.attemptCount, 2);
        assert.equal(reclaimSends, 1);

        report = { successSends, reclaimSends };
        throw new RollbackSignal();
      }, { timeout: 30_000 });
      throw new Error("alert notification dispatcher smoke rollback missing");
    } catch (error) {
      if (!(error instanceof RollbackSignal)) throw error;
    }

    const temporaryNotifications = await prisma.alertNotificationOutbox.count({ where: { alertEvent: { vehicleId } } });
    const temporaryEvents = await prisma.alertEvent.count({ where: { vehicleId } });
    const temporaryVehicles = await prisma.vehicle.count({ where: { id: vehicleId } });
    assert.deepEqual([temporaryNotifications, temporaryEvents, temporaryVehicles], [0, 0, 0]);
    report = { ...report, temporaryNotifications, temporaryEvents, temporaryVehicles };
  } catch (error) {
    console.log(`alert notification dispatcher smoke: failed (${error instanceof Error ? `${error.name}: ${error.message}` : "unknown"})`);
    process.exitCode = 1;
  } finally {
    globalThis.fetch = nativeFetch;
    await prisma.$disconnect().catch(() => { process.exitCode = 1; });
  }

  if (process.exitCode !== 1 && report) {
    console.log("alert notification dispatcher smoke: passed");
    console.log("success transition: verified");
    console.log("retry transition: verified");
    console.log("expired lease reclaim: verified");
    console.log("transaction rollback: verified");
    console.log(`temporary notifications: ${report.temporaryNotifications}`);
    console.log(`temporary events: ${report.temporaryEvents}`);
    console.log(`temporary vehicles: ${report.temporaryVehicles}`);
    console.log(`fake sends: ${report.successSends + report.reclaimSends}`);
    console.log(`external requests: ${externalRequests}`);
  }
}

if (require.main === module) void main().catch((error) => {
  console.log(`alert notification dispatcher smoke: failed (${error instanceof Error ? error.name : "unknown"})`);
  process.exitCode = 1;
});
