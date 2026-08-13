const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { performance } = require("node:perf_hooks");
const test = require("node:test");
require("reflect-metadata");
process.env.SYNC_SCHEDULER_ENABLED = "false";
process.env.ALERT_INGESTION_ENABLED = "false";
process.env.POSITION_HISTORY_MAINTENANCE_ENABLED = "false";
process.env.POSITION_HISTORY_RETENTION_ENABLED = "false";
process.env.TELEGRAM_NOTIFICATIONS_ENABLED = "false";
const { PrismaPg } = require("@prisma/adapter-pg");
const { NestFactory } = require("@nestjs/core");
const { PrismaClient, AuditActorType, AuditEventType, AuditTargetType, AuthRole } = require("../dist/generated/prisma/client");
const { AppModule } = require("../dist/app.module");
const { hashSessionToken } = require("../dist/modules/auth/session");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const marker = crypto.randomUUID();
const loginPrefix = `stage20c-${marker}`;
const ownedUserIds = [];
const ownedAuditIds = [];
const protectedTables = [
  "auth_users", "auth_user_permissions", "auth_sessions", "audit_events",
  "vehicles", "vehicle_current_states", "daily_vehicle_stats", "vehicle_position_observations", "vehicle_position_backfill_checkpoints", "position_history_population_runs",
  "alert_evaluation_observations", "alert_events", "alert_event_confirmations", "alert_notification_outbox", "application_settings",
];

async function snapshot() {
  const result = {};
  for (const table of protectedTables) {
    const rows = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::text AS count, md5(COALESCE(string_agg(to_jsonb(row_data)::text, E'\\n' ORDER BY to_jsonb(row_data)::text), '')) AS digest FROM "${table}" AS row_data`);
    result[table] = rows[0];
  }
  return result;
}

async function cleanup() {
  if (ownedAuditIds.length > 0) await prisma.auditEvent.deleteMany({ where: { id: { in: ownedAuditIds } } });
  if (ownedUserIds.length > 0) {
    await prisma.authSession.deleteMany({ where: { userId: { in: ownedUserIds } } });
    await prisma.authUserPermission.deleteMany({ where: { userId: { in: ownedUserIds } } });
    await prisma.authUser.deleteMany({ where: { id: { in: ownedUserIds } } });
  }
}

function userData(login, role) { return { login, normalizedLogin: login.toLowerCase(), role, disabled: false, mustChangePassword: false, passwordHashVersion: 1, passwordSalt: crypto.randomBytes(16), passwordHash: crypto.randomBytes(32) }; }
function cookie(token) { return { Cookie: `taxi_session=${token}` }; }
async function json(url, headers = {}) { const response = await fetch(url, { headers }); const text = await response.text(); return { response, text, body: text === "" ? null : JSON.parse(text) }; }
function userDisabledRow(id, actor, target, createdAt, details = { targetLoginSnapshot: target.login }) { return { id, eventType: AuditEventType.USER_DISABLED, actorType: AuditActorType.USER, actorUserId: actor.id, actorLoginSnapshot: actor.login, targetType: AuditTargetType.USER, targetId: target.id, details, createdAt }; }

test("Stage 20C real viewer is authorized, cursor-stable, safe, and read-only", async () => {
  await cleanup();
  const baseline = await snapshot();
  let app;
  try {
    const admin = await prisma.authUser.create({ data: userData(`${loginPrefix}-admin`, AuthRole.ADMIN) });
    const ordinary = await prisma.authUser.create({ data: userData(`${loginPrefix}-user`, AuthRole.USER) });
    ownedUserIds.push(admin.id, ordinary.id);
    const permissions = ["fleet.view", "map.view", "events.view", "vehicles.view", "trips.view", "reports.view", "historyAdmin.view", "historyAdmin.populate"];
    await prisma.authUserPermission.createMany({ data: permissions.map((key) => ({ userId: ordinary.id, key })) });
    const adminToken = crypto.randomBytes(32).toString("base64url");
    const userToken = crypto.randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    await prisma.authSession.createMany({ data: [{ userId: admin.id, tokenHash: hashSessionToken(adminToken), expiresAt }, { userId: ordinary.id, tokenHash: hashSessionToken(userToken), expiresAt }] });

    const base = new Date("2099-08-11T02:00:00.000Z");
    const rows = [];
    for (let index = 0; index < 55; index += 1) {
      const id = crypto.randomUUID(); ownedAuditIds.push(id);
      rows.push(userDisabledRow(id, admin, ordinary, new Date(base.getTime() + (55 - index) * 1000)));
    }
    const sameAt = new Date(base.getTime() + 70_000);
    const sameIds = ["f0000000-0000-4000-8000-000000000001", "e0000000-0000-4000-8000-000000000001"];
    for (const id of sameIds) { ownedAuditIds.push(id); rows.push(userDisabledRow(id, admin, ordinary, sameAt)); }
    const malformedId = crypto.randomUUID(); ownedAuditIds.push(malformedId);
    rows.push(userDisabledRow(malformedId, admin, ordinary, new Date(base.getTime() + 80_000), { targetLoginSnapshot: ordinary.login, password: "stage20c-forbidden-fixture-secret" }));
    const systemRunId = crypto.randomUUID(); ownedAuditIds.push(systemRunId);
    rows.push({ id: systemRunId, eventType: AuditEventType.SYSTEM_POPULATION_CREATED, actorType: AuditActorType.SYSTEM, actorUserId: null, actorLoginSnapshot: null, targetType: AuditTargetType.POSITION_HISTORY_POPULATION_RUN, targetId: crypto.randomUUID(), details: { to: base.toISOString(), windowBudget: 5000, excludeProviderDisabled: true }, createdAt: new Date(base.getTime() + 79_000) });
    const automaticId = crypto.randomUUID(); ownedAuditIds.push(automaticId);
    rows.push({ id: automaticId, eventType: AuditEventType.AUTOMATIC_RETENTION_EXECUTED, actorType: AuditActorType.SYSTEM, actorUserId: null, actorLoginSnapshot: null, targetType: AuditTargetType.POSITION_HISTORY_RETENTION, targetId: null, details: { canonicalAnchor: base.toISOString(), policyCutoff: "2099-05-13T02:00:00.000Z", deletedCheckpoints: 1, deletedObservations: 2, remainingFullyObsoleteCheckpoints: 0, remainingExecutableObservationCandidates: 0, stoppedByBudget: false }, createdAt: new Date(base.getTime() + 78_000) });
    await prisma.auditEvent.createMany({ data: rows });

    const beforeReads = await snapshot();
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix("api");
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address();
    const apiBase = `http://127.0.0.1:${address.port}`;
    const filter = `from=${encodeURIComponent(base.toISOString())}&to=${encodeURIComponent(new Date(base.getTime() + 90_000).toISOString())}`;

    assert.equal((await fetch(`${apiBase}/api/admin/audit`)).status, 401);
    assert.equal((await fetch(`${apiBase}/api/admin/audit?${filter}`, { headers: cookie(userToken) })).status, 403);
    const started = performance.now();
    const first = await json(`${apiBase}/api/admin/audit?${filter}`, cookie(adminToken));
    const elapsedMs = performance.now() - started;
    assert.equal(first.response.status, 200);
    assert.equal(first.response.headers.get("cache-control"), "no-store");
    assert.equal(first.body.items.length, 50);
    assert.equal(first.body.hasMore, true);
    assert.equal(typeof first.body.nextCursor, "string");
    assert.equal(first.text.includes("actorUserId"), false);
    assert.equal(first.text.includes("stage20c-forbidden-fixture-secret"), false);
    const malformed = first.body.items.find((item) => item.id === malformedId);
    assert.ok(malformed);
    assert.deepEqual(malformed.details, { status: "UNAVAILABLE" });
    assert.deepEqual(first.body.items.slice(0, 3).map((item) => item.id), [malformedId, systemRunId, automaticId]);

    const second = await json(`${apiBase}/api/admin/audit?${filter}&cursor=${encodeURIComponent(first.body.nextCursor)}`, cookie(adminToken));
    assert.equal(second.response.status, 200);
    assert.equal(second.body.hasMore, false);
    assert.equal(second.body.nextCursor, null);
    assert.equal(second.body.items.length, 10);
    const firstIds = new Set(first.body.items.map((item) => item.id));
    assert.equal(second.body.items.some((item) => firstIds.has(item.id)), false);
    const all = [...first.body.items, ...second.body.items];
    const same = all.filter((item) => sameIds.includes(item.id)).map((item) => item.id);
    assert.deepEqual(same, sameIds);

    const system = await json(`${apiBase}/api/admin/audit?${filter}&actorType=SYSTEM`, cookie(adminToken));
    assert.equal(system.body.items.length, 2);
    assert.equal(system.body.items.every((item) => item.actor.type === "SYSTEM"), true);
    const exactBoundary = await json(`${apiBase}/api/admin/audit?from=${encodeURIComponent(sameAt.toISOString())}&to=${encodeURIComponent(sameAt.toISOString())}`, cookie(adminToken));
    assert.deepEqual(exactBoundary.body.items.map((item) => item.id), sameIds);
    assert.equal((await fetch(`${apiBase}/api/admin/audit?limit=50`, { headers: cookie(adminToken) })).status, 400);

    const { forwardAuditReadToUpstream } = require("../../web/.test-dist/lib/audit/audit-bff-core");
    const bff = await forwardAuditReadToUpstream(new Request(`http://app.test/api/admin/audit?${filter}`, { headers: cookie(adminToken) }), apiBase);
    assert.equal(bff.status, 200);
    assert.equal(bff.headers.get("cache-control"), "no-store");
    assert.equal((await bff.text()).includes("stage20c-forbidden-fixture-secret"), false);

    assert.deepEqual(await snapshot(), beforeReads);
    process.stdout.write(`${JSON.stringify({ fixtureAuditRows: rows.length, firstPageItems: first.body.items.length, secondPageItems: second.body.items.length, identicalTimestampOrder: same, malformedFallback: true, unauthenticatedStatus: 401, userStatus: 403, adminStatus: 200, bffStatus: 200, queryElapsedMs: Number(elapsedMs.toFixed(3)), viewerReadDigestsIdentical: true, externalRequests: 0 })}\n`);
  } finally {
    if (app) await app.close();
    await cleanup();
    assert.deepEqual(await snapshot(), baseline);
  }
});

test.after(async () => { await cleanup(); await prisma.$disconnect(); });
