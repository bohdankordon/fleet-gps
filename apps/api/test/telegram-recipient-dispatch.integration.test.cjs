const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const test = require("node:test");
const { createTestPgClient, createTestPrismaClient, resetTestDatabase } = require("../test-support/isolated-postgres.cjs");
const { RecipientDeliveryRepository } = require("../dist/modules/alert-notifications/recipient-delivery.repository");
const { RecipientDeliveryDispatcherService } = require("../dist/modules/alert-notifications/recipient-delivery-dispatcher.service");
const { AlertNotificationMessageFormatter } = require("../dist/modules/alert-notifications/alert-notification-message.formatter");
const { TelegramProductTransportError } = require("../dist/modules/telegram-linking/telegram-product-bot.transport");
const { recipientDeliveryRetryDelayMs } = require("../dist/modules/alert-notifications/recipient-delivery-retry.policy");

let prisma; let device = 9_400_000; let identity = 6_000_000_000n;
const enabled = Object.freeze({ telegramPerUserDispatch: Object.freeze({ enabled: true, dispatchIntervalMs: 60_000, batchSize: 20, dispatchNotBefore: null }) });
const disabled = Object.freeze({ telegramPerUserDispatch: Object.freeze({ enabled: false, dispatchIntervalMs: 60_000, batchSize: 20, dispatchNotBefore: null }) });
function repository(client = prisma) { return new RecipientDeliveryRepository({ getClient: () => client }); }
function dispatcher(transport, config = enabled, client = prisma) { return new RecipientDeliveryDispatcherService(repository(client), new AlertNotificationMessageFormatter(), transport, config); }
async function reset() { const client = await createTestPgClient(); try { await resetTestDatabase(client); } finally { await client.end(); } }
async function seed(options = {}) {
  await prisma.applicationSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });
  const vehicle = await prisma.vehicle.create({ data: { externalDeviceId: device += 1, name: "Recipient taxi", disabled: options.vehicleDisabled ?? false } });
  const suffix = randomUUID().slice(0, 8); const user = await prisma.authUser.create({ data: { login: `recipient-${suffix}`, normalizedLogin: `recipient-${suffix}`, passwordHash: Buffer.from("hash"), passwordSalt: Buffer.from("salt"), passwordHashVersion: 1, role: "USER", disabled: options.disabled ?? false, mustChangePassword: options.mustChangePassword ?? false } });
  await prisma.authUserPermission.createMany({ data: (options.permissions ?? ["events.view", "vehicles.view"]).map((key) => ({ userId: user.id, key })) });
  await prisma.userNotificationPreferences.create({ data: { userId: user.id, enabled: options.master ?? true, speedingEnabled: true, inactivityEnabled: true, vehicleScope: "ALL" } });
  identity += 2n; const connection = await prisma.telegramConnection.create({ data: { userId: user.id, telegramUserId: identity, telegramChatId: identity + 1n, status: "CONNECTED", connectionRevision: options.revision ?? 3, linkedAt: new Date() } });
  const event = await prisma.alertEvent.create({ data: { vehicleId: vehicle.id, type: "SPEEDING", status: "OPEN", confirmedAt: new Date(), lastObservedAt: new Date(), dedupeKey: randomUUID().replaceAll("-", "").padEnd(64, "d"), activeKey: randomUUID().replaceAll("-", "").padEnd(64, "a"), speedZone: "CITY", confirmationSpeedKph: 70, lastSpeedKph: 70, peakSpeedKph: 70, speedThresholdKph: 60 } });
  const notification = await prisma.alertNotification.create({ data: { alertEventId: event.id, kind: "ALERT_CONFIRMED" } });
  const delivery = await prisma.alertNotificationDelivery.create({ data: { notificationId: notification.id, userId: user.id, connectionRevision: connection.connectionRevision } });
  return { vehicle, user, connection, event, notification, delivery };
}
test.before(async () => { prisma = createTestPrismaClient(); }); test.after(async () => { await prisma.$disconnect(); }); test.beforeEach(reset);

test("dispatch gate off leaves PENDING rows untouched and makes zero send calls", async () => { const value = await seed(); let sends = 0; const result = await dispatcher({ sendAlertConfirmed: async () => { sends += 1; } }, disabled).dispatchBatch(20); assert.deepEqual(result, { claimed: 0, sent: 0, retryScheduled: 0, suppressed: 0, failed: 0, lostLease: 0 }); assert.equal(sends, 0); assert.equal((await prisma.alertNotificationDelivery.findUnique({ where: { id: value.delivery.id } })).status, "PENDING"); });

test("cutover boundary terminally suppresses pre-boundary shadow rows but permits rows at the exact boundary", async () => {
  const boundary = new Date(Date.now() - 1_000); const before = await seed(); const at = await seed();
  await prisma.alertNotificationDelivery.update({ where: { id: before.delivery.id }, data: { createdAt: new Date(boundary.getTime() - 1) } });
  await prisma.alertNotificationDelivery.update({ where: { id: at.delivery.id }, data: { createdAt: boundary } });
  let sends = 0;
  const result = await dispatcher({ sendAlertConfirmed: async () => { sends += 1; } }, Object.freeze({ telegramPerUserDispatch: Object.freeze({ enabled: true, dispatchIntervalMs: 60_000, batchSize: 20, dispatchNotBefore: boundary }) })).dispatchBatch(20);
  const beforeRow = await prisma.alertNotificationDelivery.findUnique({ where: { id: before.delivery.id } }); const atRow = await prisma.alertNotificationDelivery.findUnique({ where: { id: at.delivery.id } });
  assert.deepEqual([result.suppressed, result.sent, sends, beforeRow.status, beforeRow.attemptCount, beforeRow.lastFailureCode, atRow.status, atRow.attemptCount], [1, 1, 1, "SUPPRESSED", 0, "CUTOVER_BOUNDARY", "SENT", 1]);
});

test("successful delivery is SENT with one actual attempt, while stale eligibility is terminally SUPPRESSED", async () => {
  const sent = await seed(); const suppressed = await seed(); await prisma.authUser.update({ where: { id: suppressed.user.id }, data: { disabled: true } }); let sends = 0;
  const result = await dispatcher({ sendAlertConfirmed: async () => { sends += 1; } }).dispatchBatch(20);
  assert.deepEqual([result.sent, result.suppressed, sends], [1, 1, 1]);
  assert.deepEqual([(await prisma.alertNotificationDelivery.findUnique({ where: { id: sent.delivery.id } })).status, (await prisma.alertNotificationDelivery.findUnique({ where: { id: suppressed.delivery.id } })).status], ["SENT", "SUPPRESSED"]);
});

test("transient retry, permanent recipient failure, and terminal rows remain recipient-independent", async () => {
  const retry = await seed(); const permanent = await seed(); const terminal = await seed(); await prisma.alertNotificationDelivery.update({ where: { id: terminal.delivery.id }, data: { status: "SENT", sentAt: new Date() } });
  const result = await dispatcher({ sendAlertConfirmed: async (chatId) => { if (chatId === retry.connection.telegramChatId) throw new TelegramProductTransportError("NETWORK", true); throw new TelegramProductTransportError("HTTP_4XX", false, true); } }).dispatchBatch(20);
  assert.deepEqual([result.retryScheduled, result.failed], [1, 1]);
  const retryRow = await prisma.alertNotificationDelivery.findUnique({ where: { id: retry.delivery.id } }); const failedRow = await prisma.alertNotificationDelivery.findUnique({ where: { id: permanent.delivery.id } }); const connection = await prisma.telegramConnection.findUnique({ where: { userId: permanent.user.id } });
  assert.deepEqual([retryRow.status, retryRow.attemptCount, failedRow.status, failedRow.attemptCount, connection.status], ["PENDING", 1, "FAILED", 1, "BROKEN"]);
  assert.equal((await prisma.alertNotificationDelivery.findUnique({ where: { id: terminal.delivery.id } })).status, "SENT");
});

test("SKIP LOCKED excludes concurrent same-row claims, allows stale lease recovery, and ignores future rows", async () => {
  const value = await seed(); const first = createTestPrismaClient(); const second = createTestPrismaClient();
  try {
    const [a, b] = await Promise.all([repository(first).claimNext(1, randomUUID()), repository(second).claimNext(1, randomUUID())]); assert.equal(a.length + b.length, 1);
    await prisma.alertNotificationDelivery.update({ where: { id: value.delivery.id }, data: { leaseUntil: new Date(Date.now() - 1), leaseToken: randomUUID() } }); assert.equal((await repository().claimNext(1, randomUUID())).length, 1);
    const future = await seed(); await prisma.alertNotificationDelivery.update({ where: { id: future.delivery.id }, data: { nextAttemptAt: new Date(Date.now() + 60_000) } }); assert.equal((await repository().claimNext(1, randomUUID())).some((row) => row.id === future.delivery.id), false);
  } finally { await Promise.all([first.$disconnect(), second.$disconnect()]); }
});

test("a permanent old-generation failure cannot break a newly relinked connection", async () => {
  const value = await seed(); const claimed = (await repository().claimNext(1, randomUUID()))[0]; await prisma.telegramConnection.update({ where: { userId: value.user.id }, data: { connectionRevision: 4 } });
  await repository().markFailed(claimed.id, claimed.leaseToken, "HTTP_4XX", true);
  const connection = await prisma.telegramConnection.findUnique({ where: { userId: value.user.id } }); const delivery = await prisma.alertNotificationDelivery.findUnique({ where: { id: value.delivery.id } }); assert.deepEqual([delivery.status, connection.status, connection.connectionRevision], ["FAILED", "CONNECTED", 4]);
});

test("retry policy is bounded at twelve actual attempts and twenty-four durable hours", async () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 12].map((attempt) => recipientDeliveryRetryDelayMs(attempt)), [60_000, 120_000, 240_000, 480_000, 960_000, 1_920_000, 3_600_000, 3_600_000]);
  const attempts = await seed(); await prisma.alertNotificationDelivery.update({ where: { id: attempts.delivery.id }, data: { attemptCount: 11 } });
  await dispatcher({ sendAlertConfirmed: async () => { throw new TelegramProductTransportError("NETWORK", true); } }).dispatchBatch(1);
  assert.deepEqual([(await prisma.alertNotificationDelivery.findUnique({ where: { id: attempts.delivery.id } })).status, (await prisma.alertNotificationDelivery.findUnique({ where: { id: attempts.delivery.id } })).attemptCount], ["FAILED", 12]);
  const aged = await seed(); await prisma.alertNotificationDelivery.update({ where: { id: aged.delivery.id }, data: { createdAt: new Date(Date.now() - 24 * 60 * 60_000 - 1) } });
  const result = await dispatcher({ sendAlertConfirmed: async () => { throw new Error("must not send expired row"); } }).dispatchBatch(20);
  assert.equal(result.claimed, 0); assert.equal((await prisma.alertNotificationDelivery.findUnique({ where: { id: aged.delivery.id } })).status, "FAILED");
});
