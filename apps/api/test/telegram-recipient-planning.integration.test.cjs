const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const test = require("node:test");
const { createTestPgClient, createTestPrismaClient, resetTestDatabase } = require("../test-support/isolated-postgres.cjs");
const { AlertNotificationRecipientPlanner } = require("../dist/modules/alert-notifications/alert-notification-recipient-planner.service");
const { PrismaAlertEventsRepository } = require("../dist/modules/alert-events/prisma-alert-events.repository");

let prisma;
let externalDeviceId = 9_300_000;
let telegramIdentity = 5_000_000_000n;
const enabledConfig = Object.freeze({ telegramPerUserNotifications: Object.freeze({ enabled: true }) });
const disabledConfig = Object.freeze({ telegramPerUserNotifications: Object.freeze({ enabled: false }) });

function planner(config = enabledConfig) { return new AlertNotificationRecipientPlanner(config); }
function repository(client, config = enabledConfig) { return new PrismaAlertEventsRepository({ getClient: () => client }, planner(config)); }
function command(vehicleId, type = "SPEEDING") {
  return type === "SPEEDING"
    ? { type, vehicleId, observedAt: new Date("2026-08-29T12:00:00.000Z"), zone: "CITY", speedKph: 75, speedThresholdKph: 60 }
    : { type, vehicleId, observedAt: new Date("2026-08-29T12:00:00.000Z"), traveledDistanceMeters: 10, distanceThresholdMeters: 300, durationThresholdMinutes: 60 };
}
function confirmationInput(vehicleId, type = "SPEEDING", suffix = randomUUID()) { return { command: command(vehicleId, type), dedupeKey: `d${suffix.replaceAll("-", "")}`.padEnd(64, "d").slice(0, 64), activeKey: `a${suffix.replaceAll("-", "")}`.padEnd(64, "a").slice(0, 64) }; }
async function vehicle(overrides = {}) { return prisma.vehicle.create({ data: { externalDeviceId: externalDeviceId += 1, name: `recipient-test-${externalDeviceId}`, ...overrides } }); }
async function user(label, options = {}) {
  const suffix = `${label}-${randomUUID().slice(0, 8)}`;
  const account = await prisma.authUser.create({ data: {
    login: suffix, normalizedLogin: suffix.toLowerCase(), passwordHash: Buffer.from("test-hash"), passwordSalt: Buffer.from("test-salt"), passwordHashVersion: 1, role: options.role ?? "USER", disabled: options.disabled ?? false, mustChangePassword: options.mustChangePassword ?? false,
  } });
  if (options.permissions) await prisma.authUserPermission.createMany({ data: options.permissions.map((key) => ({ userId: account.id, key })) });
  if (options.preferences !== false) await prisma.userNotificationPreferences.create({ data: { userId: account.id, enabled: options.enabled ?? true, speedingEnabled: options.speedingEnabled ?? true, inactivityEnabled: options.inactivityEnabled ?? true, vehicleScope: options.scope ?? "ALL" } });
  if (options.scope === "SELECTED" && options.selectedVehicleId) await prisma.userNotificationVehicle.create({ data: { userId: account.id, vehicleId: options.selectedVehicleId } });
  if (options.connection !== false) {
    telegramIdentity += 2n;
    await prisma.telegramConnection.create({ data: { userId: account.id, telegramUserId: telegramIdentity, telegramChatId: telegramIdentity + 1n, status: options.connectionStatus ?? "CONNECTED", linkedAt: new Date(), connectionRevision: options.connectionRevision ?? 3 } });
  }
  return account;
}
async function confirm(vehicleId, type = "SPEEDING", client = prisma, config = enabledConfig) {
  const result = await repository(client, config).registerConfirmation(confirmationInput(vehicleId, type));
  assert.equal(result.outcome, "CREATED");
  return result.event.id;
}
async function reset() { const client = await createTestPgClient(); try { await resetTestDatabase(client); } finally { await client.end(); } }
async function deliveries(eventId) { return prisma.alertNotificationDelivery.findMany({ where: { notification: { alertEventId: eventId } }, orderBy: { userId: "asc" } }); }

test.before(async () => { prisma = createTestPrismaClient(); });
test.after(async () => { await prisma.$disconnect(); });
test.beforeEach(async () => { await reset(); });

test("feature gate defaults off while legacy confirmed-alert outbox remains unchanged", async () => {
  const fleetVehicle = await vehicle();
  await user("eligible", { permissions: ["events.view", "vehicles.view"] });
  const eventId = await confirm(fleetVehicle.id, "SPEEDING", prisma, disabledConfig);
  assert.equal(await prisma.alertNotification.count(), 0);
  assert.equal(await prisma.alertNotificationDelivery.count(), 0);
  assert.equal(await prisma.alertNotificationOutbox.count({ where: { alertEventId: eventId, kind: "ALERT_CONFIRMED" } }), 1);
});

test("eligible users receive independent PENDING deliveries with retry defaults and no sensitive identity copy", async () => {
  const fleetVehicle = await vehicle();
  const first = await user("first", { permissions: ["events.view", "vehicles.view"] });
  const second = await user("second", { role: "ADMIN" });
  const eventId = await confirm(fleetVehicle.id);
  const rows = await deliveries(eventId);
  assert.deepEqual(rows.map((row) => row.userId), [first.id, second.id].sort());
  for (const row of rows) {
    assert.deepEqual([row.status, row.connectionRevision, row.attemptCount, row.leaseUntil, row.sentAt, row.suppressedAt, row.lastFailureCode], ["PENDING", 3, 0, null, null, null, null]);
    assert.ok(row.nextAttemptAt <= new Date());
  }
  const raw = await createTestPgClient();
  try {
    const columns = await raw.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'alert_notification_deliveries'");
    for (const forbidden of ["telegram_chat_id", "telegram_user_id", "message", "body"]) assert.equal(columns.rows.some((row) => row.column_name === forbidden), false);
  } finally { await raw.end(); }
});

test("creation-time eligibility enforces permissions before preference selection", async () => {
  const fleetVehicle = await vehicle(); const otherVehicle = await vehicle();
  const eligibleAll = await user("all", { permissions: ["events.view", "vehicles.view"] });
  const eligibleSelected = await user("selected", { permissions: ["events.view", "vehicles.view"], scope: "SELECTED", selectedVehicleId: fleetVehicle.id });
  await user("master-off", { permissions: ["events.view", "vehicles.view"], enabled: false });
  await user("no-preferences", { permissions: ["events.view", "vehicles.view"], preferences: false });
  await user("no-connection", { permissions: ["events.view", "vehicles.view"], connection: false });
  await user("disconnected", { permissions: ["events.view", "vehicles.view"], connectionStatus: "DISCONNECTED" });
  await user("broken", { permissions: ["events.view", "vehicles.view"], connectionStatus: "BROKEN" });
  const incomplete = await user("incomplete", { permissions: ["events.view", "vehicles.view"], connection: false });
  await prisma.telegramConnection.create({ data: { userId: incomplete.id, status: "CONNECTED" } });
  await user("no-events", { permissions: ["vehicles.view"] });
  const preferenceIsNotAcl = await user("no-vehicles", { permissions: ["events.view"], scope: "SELECTED", selectedVehicleId: fleetVehicle.id });
  await user("other-selected", { permissions: ["events.view", "vehicles.view"], scope: "SELECTED", selectedVehicleId: otherVehicle.id });
  await user("speed-off", { permissions: ["events.view", "vehicles.view"], speedingEnabled: false });
  await user("disabled", { permissions: ["events.view", "vehicles.view"], disabled: true });
  await user("password-change", { permissions: ["events.view", "vehicles.view"], mustChangePassword: true });
  const eventId = await confirm(fleetVehicle.id);
  assert.deepEqual((await deliveries(eventId)).map((row) => row.userId), [eligibleAll.id, eligibleSelected.id].sort());
  assert.equal((await deliveries(eventId)).some((row) => row.userId === preferenceIsNotAcl.id), false);
});

test("event toggle, SELECTED scope, and vehicle operational state are enforced", async () => {
  const fleetVehicle = await vehicle(); const disabledVehicle = await vehicle({ disabled: true });
  const inactivity = await user("inactivity", { permissions: ["events.view", "vehicles.view"], inactivityEnabled: true, speedingEnabled: false });
  await user("inactivity-off", { permissions: ["events.view", "vehicles.view"], inactivityEnabled: false });
  const selected = await user("selected-match", { permissions: ["events.view", "vehicles.view"], scope: "SELECTED", selectedVehicleId: fleetVehicle.id });
  const inactivityEvent = await confirm(fleetVehicle.id, "INACTIVITY");
  assert.deepEqual((await deliveries(inactivityEvent)).map((row) => row.userId), [inactivity.id, selected.id].sort());
  const disabledEvent = await confirm(disabledVehicle.id);
  assert.equal(await prisma.alertNotification.count({ where: { alertEventId: disabledEvent } }), 1);
  assert.equal((await deliveries(disabledEvent)).length, 0);
});

test("revision snapshot survives relink and later preference changes do not mutate pending intent", async () => {
  const fleetVehicle = await vehicle(); const account = await user("relink", { permissions: ["events.view", "vehicles.view"], connectionRevision: 3 });
  const eventId = await confirm(fleetVehicle.id); const delivery = (await deliveries(eventId))[0];
  assert.equal(delivery.connectionRevision, 3);
  await prisma.telegramConnection.update({ where: { userId: account.id }, data: { telegramUserId: telegramIdentity += 2n, telegramChatId: telegramIdentity + 1n, connectionRevision: 4 } });
  await prisma.userNotificationPreferences.update({ where: { userId: account.id }, data: { enabled: false } });
  const after = await prisma.alertNotificationDelivery.findUnique({ where: { notificationId_userId: { notificationId: delivery.notificationId, userId: account.id } } });
  assert.deepEqual([after.connectionRevision, after.status], [3, "PENDING"]);
});

test("logical notification and recipient delivery uniqueness hold for replay and concurrent planning", async () => {
  const fleetVehicle = await vehicle(); const account = await user("concurrent", { permissions: ["events.view", "vehicles.view"] });
  const input = confirmationInput(fleetVehicle.id);
  const first = createTestPrismaClient(); const second = createTestPrismaClient();
  try {
    const results = await Promise.all([repository(first).registerConfirmation(input), repository(second).registerConfirmation(input)]);
    assert.equal(results.filter((result) => result.outcome === "CREATED").length, 1);
    assert.equal(await prisma.alertNotification.count(), 1);
    assert.deepEqual((await prisma.alertNotificationDelivery.findMany()).map((row) => row.userId), [account.id]);
    const event = await prisma.alertEvent.findFirstOrThrow();
    await Promise.all([planner().plan(first, event), planner().plan(second, event)]);
    assert.equal(await prisma.alertNotification.count({ where: { alertEventId: event.id, kind: "ALERT_CONFIRMED" } }), 1);
    assert.equal(await prisma.alertNotificationDelivery.count(), 1);
  } finally { await Promise.all([first.$disconnect(), second.$disconnect()]); }
});
