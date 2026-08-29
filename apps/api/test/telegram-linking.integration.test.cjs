const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const test = require("node:test");
const { createTestPgClient, createTestPrismaClient, resetTestDatabase } = require("../test-support/isolated-postgres.cjs");
const { TelegramLinkingService, hashTelegramLinkToken } = require("../dist/modules/telegram-linking/telegram-linking.service");
const { TelegramLinkRateLimiter } = require("../dist/modules/telegram-linking/telegram-link-rate-limiter");
const { AuditEventRepository } = require("../dist/modules/audit/audit.repository");

const botUsername = "TaxiGpsTestBot";
const configuration = Object.freeze({ telegramProductLinking: Object.freeze({ enabled: true, botUsername, botToken: "fake-token", webhookSecret: "fake-secret" }) });
const LARGE_USER_ID = 4_000_000_001n;
const LARGE_CHAT_ID = 4_000_000_777n;
let prisma;

function bot(overrides = {}) { return Object.assign({ sendLinkSuccess: async () => {}, sendLinkFailure: async () => {}, sendHelp: async () => {} }, overrides); }
function databaseFor(client) { return { getClient: () => client }; }
function service(client, options = {}) {
  const database = databaseFor(client);
  return new TelegramLinkingService(database, options.audit ?? new AuditEventRepository(database), configuration, new TelegramLinkRateLimiter(), options.bot ?? bot());
}
function rawToken(result) { const value = new URL(result.telegramUrl).searchParams.get("start"); assert.ok(value); return value; }
function inbound(raw, overrides = {}) { return Object.freeze({ updateId: 5_000_000_001n, chatId: LARGE_CHAT_ID, userId: LARGE_USER_ID, chatType: "private", text: `/start ${raw}`, ...overrides }); }
function actor(user) { return Object.freeze({ actorType: "USER", actorUserId: user.id, actorLoginSnapshot: user.login }); }
function usable(tokens, now = new Date()) { return tokens.filter((entry) => entry.consumedAt === null && entry.revokedAt === null && entry.expiresAt > now); }

async function user(label, overrides = {}) {
  const suffix = `${label}-${randomUUID().slice(0, 8)}`;
  return prisma.authUser.create({ data: {
    login: suffix, normalizedLogin: suffix.toLowerCase(), passwordHash: Buffer.from("synthetic-password-hash"), passwordSalt: Buffer.from("synthetic-password-salt"), passwordHashVersion: 1, role: "USER", ...overrides,
  } });
}
async function tokenFor(account) { const result = await service(prisma).createLink(account.id); return Object.freeze({ result, raw: rawToken(result) }); }
async function connectionFor(account) { return prisma.telegramConnection.findUnique({ where: { userId: account.id } }); }
async function tokensFor(account) { return prisma.telegramLinkToken.findMany({ where: { userId: account.id }, orderBy: { createdAt: "asc" } }); }
async function reset() { const client = await createTestPgClient(); try { await resetTestDatabase(client); } finally { await client.end(); } }

test.before(async () => { prisma = createTestPrismaClient(); });
test.after(async () => { await prisma.$disconnect(); });
test.beforeEach(async () => { await reset(); });

test("migrated Telegram schema has the intended real PostgreSQL contract and no delivery expansion", async () => {
  const client = await createTestPgClient();
  try {
    const columns = await client.query("SELECT table_name, column_name, udt_name, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ANY($1::text[])", [["telegram_connections", "telegram_link_tokens", "telegram_webhook_receipts"]]);
    const column = (table, name) => columns.rows.find((row) => row.table_name === table && row.column_name === name);
    assert.equal(column("telegram_connections", "telegram_user_id").udt_name, "int8");
    assert.equal(column("telegram_connections", "telegram_chat_id").udt_name, "int8");
    assert.equal(column("telegram_connections", "status").udt_name, "TelegramConnectionStatus");
    assert.equal(column("telegram_connections", "connection_revision").udt_name, "int4");
    assert.equal(column("telegram_connections", "telegram_user_id").is_nullable, "YES");
    for (const name of ["expires_at", "consumed_at", "revoked_at"]) assert.ok(column("telegram_link_tokens", name));
    assert.equal(column("telegram_webhook_receipts", "update_id").udt_name, "int8");
    const constraints = await client.query("SELECT conname FROM pg_constraint WHERE conrelid = ANY($1::regclass[])", [["telegram_connections", "telegram_link_tokens", "telegram_webhook_receipts"]]);
    for (const name of ["telegram_connections_telegram_user_key", "telegram_connections_telegram_chat_key", "telegram_connections_user_fkey", "telegram_link_tokens_user_fkey", "telegram_webhook_receipts_update_key"]) assert.ok(constraints.rows.some((row) => row.conname === name), name);
    const indexes = await client.query("SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'telegram_link_tokens'");
    assert.ok(indexes.rows.some((row) => row.indexname === "telegram_link_tokens_user_expiry_idx"));
    const legacy = await client.query("SELECT to_regclass('public.application_settings') AS settings, to_regclass('public.alert_notification_outbox') AS outbox, to_regclass('public.telegram_notification_preferences') AS preferences");
    assert.equal(legacy.rows[0].settings, "application_settings"); assert.equal(legacy.rows[0].outbox, "alert_notification_outbox"); assert.equal(legacy.rows[0].preferences, null);
    assert.equal((await client.query("SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='telegram_webhook_receipts' AND column_name ILIKE '%payload%'")).rowCount, 0);
    const preferenceColumns = await client.query("SELECT table_name, column_name, udt_name, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ANY($1::text[])", [["user_notification_preferences", "user_notification_vehicles"]]);
    const preferenceColumn = (table, name) => preferenceColumns.rows.find((row) => row.table_name === table && row.column_name === name);
    assert.equal(preferenceColumn("user_notification_preferences", "vehicle_scope").udt_name, "NotificationVehicleScope");
    assert.match(preferenceColumn("user_notification_preferences", "enabled").column_default, /false/);
    assert.match(preferenceColumn("user_notification_preferences", "speeding_enabled").column_default, /true/);
    assert.match(preferenceColumn("user_notification_preferences", "inactivity_enabled").column_default, /true/);
    assert.match(preferenceColumn("user_notification_preferences", "revision").column_default, /1/);
    const preferenceConstraints = await client.query("SELECT conname, contype, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid = ANY($1::regclass[])", [["user_notification_preferences", "user_notification_vehicles"]]);
    for (const name of ["user_notification_preferences_pkey", "user_notification_preferences_user_fkey", "user_notification_vehicles_pkey", "user_notification_vehicles_user_fkey", "user_notification_vehicles_preference_fkey", "user_notification_vehicles_vehicle_fkey"]) assert.ok(preferenceConstraints.rows.some((row) => row.conname === name), name);
    for (const row of preferenceConstraints.rows.filter((row) => row.contype === "f")) assert.match(row.definition, /ON DELETE CASCADE/);
    const preferenceIndexes = await client.query("SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'user_notification_vehicles'");
    assert.ok(preferenceIndexes.rows.some((row) => row.indexname === "user_notification_vehicles_vehicle_idx"));
    const enumValues = await client.query("SELECT enumlabel FROM pg_enum WHERE enumtypid = 'public.\"NotificationVehicleScope\"'::regtype ORDER BY enumsortorder");
    assert.deepEqual(enumValues.rows.map((row) => row.enumlabel), ["ALL", "SELECTED"]);
  } finally { await client.end(); }
});

test("notification preferences are lazy, revisioned, atomic, and independent from Telegram connection lifecycle", async () => {
  const account = await user("preferences"); const linking = service(prisma); const allowed = ["vehicles.view"];
  const initial = await linking.preferences(account.id, allowed);
  assert.deepEqual({ enabled: initial.enabled, speedingEnabled: initial.speedingEnabled, inactivityEnabled: initial.inactivityEnabled, vehicleScope: initial.vehicleScope, revision: initial.revision }, { enabled: false, speedingEnabled: true, inactivityEnabled: true, vehicleScope: "ALL", revision: 0 });
  const vehicle = await prisma.vehicle.create({ data: { externalDeviceId: 9_100_001, name: "Synthetic preference vehicle" } });
  const saved = await linking.updatePreferences(account.id, allowed, { expectedRevision: 0, enabled: true, speedingEnabled: false, inactivityEnabled: true, vehicleScope: "SELECTED", selectedVehicleIds: [vehicle.id] });
  assert.deepEqual([saved.revision, saved.vehicleScope, saved.selectedVehicleIds], [1, "SELECTED", [vehicle.id]]);
  await assert.rejects(() => linking.updatePreferences(account.id, allowed, { expectedRevision: 0, enabled: false, speedingEnabled: true, inactivityEnabled: true, vehicleScope: "ALL", selectedVehicleIds: [] }), /CONFLICT/);
  await assert.rejects(() => linking.updatePreferences(account.id, allowed, { expectedRevision: 1, enabled: true, speedingEnabled: true, inactivityEnabled: true, vehicleScope: "SELECTED", selectedVehicleIds: [] }), /INVALID_INPUT/);
  const withoutVehicles = await linking.preferences(account.id, []); assert.deepEqual([withoutVehicles.canSelectVehicles, withoutVehicles.selectedVehicleIds, withoutVehicles.vehicles], [false, [], []]);
  const issued = await tokenFor(account); await linking.consume(inbound(issued.raw)); await linking.disconnect(actor(account), account.id);
  const afterDisconnect = await linking.preferences(account.id, allowed); assert.deepEqual([afterDisconnect.enabled, afterDisconnect.vehicleScope, afterDisconnect.selectedVehicleIds], [true, "SELECTED", [vehicle.id]]);
  const client = await createTestPgClient(); try { const tables = await client.query("SELECT to_regclass('public.user_notification_preferences') AS prefs, to_regclass('public.user_notification_vehicles') AS selections, to_regclass('public.alert_notification_delivery') AS delivery"); assert.equal(tables.rows[0].prefs, "user_notification_preferences"); assert.equal(tables.rows[0].selections, "user_notification_vehicles"); assert.equal(tables.rows[0].delivery, null); } finally { await client.end(); }
});

test("persists only a SHA-256 token hash, revokes replacements, and leaves an existing connection active", async () => {
  const account = await user("token");
  const before = Date.now(); const first = await tokenFor(account); const after = Date.now();
  assert.match(first.raw, /^[A-Za-z0-9_-]{43}$/);
  let rows = await tokensFor(account); assert.equal(rows.length, 1);
  assert.deepEqual(Buffer.from(rows[0].tokenHash), Buffer.from(hashTelegramLinkToken(first.raw)));
  assert.equal(rows[0].consumedAt, null); assert.equal(rows[0].revokedAt, null);
  assert.ok(rows[0].expiresAt.getTime() >= before + 599_000 && rows[0].expiresAt.getTime() <= after + 601_000);
  await prisma.telegramConnection.create({ data: { userId: account.id, telegramUserId: 4_100_000_001n, telegramChatId: 4_100_000_002n, status: "CONNECTED", linkedAt: new Date() } });
  const second = await tokenFor(account); rows = await tokensFor(account);
  assert.equal(rows.length, 2); assert.equal(rows[0].consumedAt, null); assert.ok(rows[0].revokedAt); assert.equal(rows[1].revokedAt, null);
  assert.equal(usable(rows).length, 1); assert.deepEqual(Buffer.from(rows[1].tokenHash), Buffer.from(hashTelegramLinkToken(second.raw)));
  assert.equal((await connectionFor(account)).status, "CONNECTED");
  const persisted = JSON.stringify({ rows, connection: await connectionFor(account), receipts: await prisma.telegramWebhookReceipt.findMany(), audit: await prisma.auditEvent.findMany() }, (_, value) => typeof value === "bigint" ? value.toString() : value);
  assert.equal(persisted.includes(first.raw), false); assert.equal(persisted.includes(second.raw), false);
});

test("token states and account security are rechecked before consumption without partial relinks", async () => {
  const account = await user("states");
  await prisma.telegramConnection.create({ data: { userId: account.id, telegramUserId: 4_200_000_001n, telegramChatId: 4_200_000_002n, status: "CONNECTED", linkedAt: new Date() } });
  const original = await connectionFor(account);
  const expired = await tokenFor(account); await prisma.telegramLinkToken.updateMany({ where: { userId: account.id, tokenHash: Buffer.from(hashTelegramLinkToken(expired.raw)) }, data: { expiresAt: new Date(Date.now() - 1) } });
  assert.equal(await service(prisma).consume(inbound(expired.raw, { updateId: 5_100_000_001n })), "INVALID");
  const revoked = await tokenFor(account); await prisma.telegramLinkToken.updateMany({ where: { userId: account.id, tokenHash: Buffer.from(hashTelegramLinkToken(revoked.raw)) }, data: { revokedAt: new Date() } });
  assert.equal(await service(prisma).consume(inbound(revoked.raw, { updateId: 5_100_000_002n })), "INVALID");
  const consumed = await tokenFor(account); assert.equal(await service(prisma).consume(inbound(consumed.raw, { updateId: 5_100_000_003n })), "LINKED");
  assert.equal(await service(prisma).consume(inbound(consumed.raw, { updateId: 5_100_000_004n })), "INVALID");
  assert.equal((await connectionFor(account)).connectionRevision, original.connectionRevision + 1);
  const disabled = await tokenFor(account); await prisma.authUser.update({ where: { id: account.id }, data: { disabled: true } });
  assert.equal(await service(prisma).consume(inbound(disabled.raw, { updateId: 5_100_000_005n })), "DISABLED");
  await prisma.authUser.update({ where: { id: account.id }, data: { disabled: false, mustChangePassword: false } });
  const passwordChange = await tokenFor(account); await prisma.authUser.update({ where: { id: account.id }, data: { mustChangePassword: true } });
  assert.equal(await service(prisma).consume(inbound(passwordChange.raw, { updateId: 5_100_000_006n })), "DISABLED");
  const final = await connectionFor(account); assert.deepEqual([final.telegramUserId, final.telegramChatId, final.status, final.connectionRevision], [LARGE_USER_ID, LARGE_CHAT_ID, "CONNECTED", original.connectionRevision + 1]);
});

test("same-user advisory locking leaves exactly one usable token while different users proceed independently", async () => {
  const first = await user("same-a"); const second = await user("same-b");
  const clientA = createTestPrismaClient(); const clientB = createTestPrismaClient();
  try {
    const same = await Promise.all([service(clientA).createLink(first.id), service(clientB).createLink(first.id)]);
    const sameRows = await tokensFor(first); const usableRows = usable(sameRows);
    assert.equal(sameRows.length, 2); assert.equal(usableRows.length, 1);
    const usableRaw = same.map(rawToken).filter((value) => Buffer.from(hashTelegramLinkToken(value)).equals(Buffer.from(usableRows[0].tokenHash)));
    assert.equal(usableRaw.length, 1); assert.equal(sameRows.filter((row) => row.revokedAt !== null).length, 1); assert.equal(await connectionFor(first), null);
    await Promise.all([service(clientA).createLink(first.id), service(clientB).createLink(second.id)]);
    assert.equal(usable(await tokensFor(first)).length, 1); assert.equal(usable(await tokensFor(second)).length, 1);
  } finally { await Promise.all([clientA.$disconnect(), clientB.$disconnect()]); }
});

test("private first link and relink preserve exact BIGINT IDs; non-private and identity conflicts preserve the active connection", async () => {
  const account = await user("link"); const issued = await tokenFor(account);
  assert.equal(await service(prisma).consume(inbound(issued.raw)), "LINKED");
  let connection = await connectionFor(account);
  assert.deepEqual([connection.status, connection.telegramUserId, connection.telegramChatId, connection.connectionRevision], ["CONNECTED", LARGE_USER_ID, LARGE_CHAT_ID, 1]);
  assert.equal((await tokensFor(account))[0].consumedAt !== null, true); assert.equal((await prisma.telegramWebhookReceipt.count()), 1);
  const nonPrivate = await tokenFor(account);
  for (const chatType of ["group", "supergroup", "channel"]) assert.equal(await service(prisma).consume(inbound(nonPrivate.raw, { chatType, updateId: BigInt(5_200_000_000 + chatType.length) })), "IGNORED");
  connection = await connectionFor(account); assert.deepEqual([connection.telegramUserId, connection.telegramChatId, connection.connectionRevision], [LARGE_USER_ID, LARGE_CHAT_ID, 1]);
  const rival = await user("rival"); const rivalToken = await tokenFor(rival);
  assert.equal(await service(prisma).consume(inbound(rivalToken.raw, { updateId: 5_200_000_010n, chatId: 4_300_000_001n })), "INVALID");
  const rivalAgain = await tokenFor(rival);
  assert.equal(await service(prisma).consume(inbound(rivalAgain.raw, { updateId: 5_200_000_011n, userId: 4_300_000_002n, chatId: LARGE_CHAT_ID })), "INVALID");
  assert.equal(await connectionFor(rival), null); connection = await connectionFor(account); assert.deepEqual([connection.telegramUserId, connection.telegramChatId, connection.connectionRevision], [LARGE_USER_ID, LARGE_CHAT_ID, 1]);
  const relink = await tokenFor(account); const newUser = 4_400_000_001n; const newChat = 4_400_000_002n;
  assert.equal(await service(prisma).consume(inbound(relink.raw, { updateId: 5_200_000_012n, userId: newUser, chatId: newChat })), "LINKED");
  connection = await connectionFor(account); assert.deepEqual([connection.telegramUserId, connection.telegramChatId, connection.connectionRevision], [newUser, newChat, 2]);
});

test("disconnect is durable and idempotent, revokes pending tokens, and leaves auth/session data intact", async () => {
  const account = await user("disconnect"); const issued = await tokenFor(account); await service(prisma).consume(inbound(issued.raw));
  const pending = await tokenFor(account); await prisma.authSession.create({ data: { userId: account.id, tokenHash: Buffer.from("synthetic-session-token"), expiresAt: new Date(Date.now() + 60_000) } });
  const linking = service(prisma); assert.equal((await linking.disconnect(actor(account), account.id)).status, "NOT_CONNECTED");
  let connection = await connectionFor(account); assert.deepEqual([connection.status, connection.telegramUserId, connection.telegramChatId, connection.connectionRevision], ["DISCONNECTED", null, null, 2]);
  assert.ok((await tokensFor(account)).find((row) => Buffer.from(row.tokenHash).equals(Buffer.from(hashTelegramLinkToken(pending.raw))) && row.revokedAt !== null));
  assert.equal(await prisma.authUser.count({ where: { id: account.id } }), 1); assert.equal(await prisma.authSession.count({ where: { userId: account.id } }), 1);
  await linking.disconnect(actor(account), account.id); connection = await connectionFor(account); assert.equal(connection.connectionRevision, 2); assert.equal(await prisma.telegramConnection.count({ where: { userId: account.id } }), 1);
});

test("receipt, token, connection, and audit commit atomically; rollback permits same-update retry and successful duplicates are inert", async () => {
  const account = await user("atomic"); const issued = await tokenFor(account); const update = inbound(issued.raw, { updateId: 5_300_000_001n });
  const failingAudit = { append: async () => { throw new Error("controlled audit failure"); } };
  assert.equal(await service(prisma, { audit: failingAudit }).consume(update), "INVALID");
  assert.equal(await prisma.telegramWebhookReceipt.count({ where: { updateId: update.updateId } }), 0);
  assert.equal((await tokensFor(account))[0].consumedAt, null); assert.equal(await connectionFor(account), null);
  assert.equal(await service(prisma).consume(update), "LINKED");
  let connection = await connectionFor(account); assert.equal(await prisma.telegramWebhookReceipt.count({ where: { updateId: update.updateId } }), 1); assert.ok((await tokensFor(account))[0].consumedAt); assert.equal(connection.connectionRevision, 1);
  assert.equal(await service(prisma).consume(update), "DUPLICATE"); connection = await connectionFor(account); assert.equal(await prisma.telegramWebhookReceipt.count({ where: { updateId: update.updateId } }), 1); assert.equal(connection.connectionRevision, 1);
  const audit = await prisma.auditEvent.findMany({ where: { targetId: account.id } }); assert.equal(audit.length, 1); assert.equal(JSON.stringify(audit).includes(issued.raw), false);
});

test("a post-commit bot failure cannot undo a successful link", async () => {
  const account = await user("bot-failure"); const issued = await tokenFor(account); const update = inbound(issued.raw, { updateId: 5_400_000_001n });
  assert.equal(await service(prisma, { bot: bot({ sendLinkSuccess: async () => { throw new Error("fake transport failure"); } }) }).consume(update), "LINKED");
  const connection = await connectionFor(account); assert.deepEqual([connection.status, connection.connectionRevision], ["CONNECTED", 1]);
  assert.ok((await tokensFor(account))[0].consumedAt); assert.equal(await prisma.telegramWebhookReceipt.count({ where: { updateId: update.updateId } }), 1);
});

test("an ADMIN force-disconnect is durable, target-safe, and records one privacy-safe Telegram audit event", async () => {
  const admin = await user("telegram-admin", { role: "ADMIN" }); const account = await user("telegram-target");
  await prisma.telegramConnection.create({ data: { userId: account.id, telegramUserId: 4_800_000_001n, telegramChatId: 4_800_000_002n, status: "CONNECTED", linkedAt: new Date() } });
  const pending = await tokenFor(account);
  await service(prisma).disconnect(Object.freeze({ actorType: "USER", actorUserId: admin.id, actorLoginSnapshot: admin.login }), admin.id, account.id);
  const connection = await connectionFor(account); assert.deepEqual([connection.status, connection.telegramUserId, connection.telegramChatId, connection.connectionRevision], ["DISCONNECTED", null, null, 2]);
  const audit = await prisma.auditEvent.findMany({ where: { targetId: account.id, eventType: "TELEGRAM_DISCONNECTED" } });
  assert.equal(audit.length, 1); assert.deepEqual([audit[0].actorUserId, audit[0].actorLoginSnapshot, audit[0].targetType, audit[0].details], [admin.id, admin.login, "USER", {}]);
  const persisted = JSON.stringify({ audit, connection, tokens: await tokensFor(account) }, (_, value) => typeof value === "bigint" ? value.toString() : value);
  for (const forbidden of [pending.raw, "4800000001", "4800000002", "test-product-token"]) assert.equal(persisted.includes(forbidden), false);
  await service(prisma).disconnect(Object.freeze({ actorType: "USER", actorUserId: admin.id, actorLoginSnapshot: admin.login }), admin.id, account.id);
  assert.equal(await prisma.auditEvent.count({ where: { targetId: account.id, eventType: "TELEGRAM_DISCONNECTED" } }), 1);
});
