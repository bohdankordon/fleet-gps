const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const { PrismaPg } = require("@prisma/adapter-pg");
const { AuthRole, PrismaClient, PositionHistoryPopulationRunStatus } = require("../dist/generated/prisma/client");
const { PositionHistoryPopulationRunCreationService } = require("../dist/modules/position-history-population-runs/position-history-population-run-creation.service");
const { PositionHistoryPopulationRunAdminService } = require("../dist/modules/position-history-population-runs/position-history-population-run-admin.service");
const { PositionHistoryPopulationRunConflictError } = require("../dist/modules/position-history-population-runs/position-history-population-run.errors");
const { AuditEventRepository } = require("../dist/modules/audit/audit.repository");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const database = { getClient: () => prisma };
const admin = new PositionHistoryPopulationRunAdminService(database, new PositionHistoryPopulationRunCreationService(database, new AuditEventRepository(database)));
const runIds = new Set();
let userId = null;
const protectedTables = ["vehicles", "vehicle_current_states", "daily_vehicle_stats", "vehicle_position_observations", "vehicle_position_backfill_checkpoints", "alert_evaluation_observations", "alert_events", "alert_notification_outbox", "application_settings"];

async function protectedSnapshot() {
  const snapshot = {};
  for (const table of protectedTables) snapshot[table] = (await prisma.$queryRawUnsafe(`SELECT COUNT(*)::text AS count, COALESCE(SUM(hashtextextended(xmin::text || ':' || ctid::text, 0)::numeric), 0)::text AS version FROM "${table}"`))[0];
  return snapshot;
}

async function authCounts() {
  return { users: await prisma.authUser.count(), permissions: await prisma.authUserPermission.count(), sessions: await prisma.authSession.count() };
}

async function auditDigest() {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::text AS count,
           md5(COALESCE(string_agg(to_jsonb(row_data)::text, E'\\n' ORDER BY to_jsonb(row_data)::text), '')) AS digest
    FROM "audit_events" AS row_data
  `);
  return rows[0];
}

async function cleanup() {
  if (runIds.size > 0) {
    const fixtureAuditIds = (await prisma.auditEvent.findMany({
      where: { targetType: "POSITION_HISTORY_POPULATION_RUN", targetId: { in: [...runIds] } },
      select: { id: true },
    })).map(({ id }) => id);
    if (fixtureAuditIds.length > 0) await prisma.auditEvent.deleteMany({ where: { id: { in: fixtureAuditIds } } });
    await prisma.positionHistoryPopulationRun.deleteMany({ where: { id: { in: [...runIds] } } });
  }
  if (userId !== null) {
    await prisma.authSession.deleteMany({ where: { userId } });
    await prisma.authUserPermission.deleteMany({ where: { userId } });
    await prisma.authUser.deleteMany({ where: { id: userId } });
  }
}

test("Stage 18B USER create, safe active/recent reads, conflict, terminal release, and cleanup use PostgreSQL without provider work", async () => {
  const beforeProtected = await protectedSnapshot(); const beforeAuth = await authCounts();
  const beforeAudit = await auditDigest();
  assert.equal(await prisma.positionHistoryPopulationRun.count({ where: { status: { in: [PositionHistoryPopulationRunStatus.PENDING, PositionHistoryPopulationRunStatus.RUNNING] } } }), 0, "an unexplained active durable run exists");
  try {
    const marker = crypto.randomUUID();
    const user = await prisma.authUser.create({ data: { login: `stage18b-${marker}`, normalizedLogin: `stage18b-${marker}`, passwordHash: new Uint8Array(32), passwordSalt: new Uint8Array(16), passwordHashVersion: 1, role: AuthRole.USER, disabled: false, mustChangePassword: false } });
    userId = user.id;
    const browserActor = { actorType: "USER", actorUserId: user.id, actorLoginSnapshot: user.login };
    const first = await admin.create(browserActor, { to: new Date("2026-08-11T02:00:00.000Z"), windowBudget: 500, excludeProviderDisabled: true }); runIds.add(first.id);
    assert.equal(first.initiatorType, "USER"); assert.equal(first.status, "PENDING"); assert.equal(first.windowBudget, 500);
    assert.equal((await prisma.positionHistoryPopulationRun.findUnique({ where: { id: first.id } })).requestedByUserId, user.id);
    assert.equal((await admin.active()).id, first.id);
    await assert.rejects(admin.create(browserActor, { to: new Date("2026-08-11T02:00:00.000Z"), windowBudget: 1000, excludeProviderDisabled: false }), PositionHistoryPopulationRunConflictError);
    assert.equal(await prisma.positionHistoryPopulationRun.count({ where: { id: { in: [...runIds] } } }), 1);

    await prisma.positionHistoryPopulationRun.update({ where: { id: first.id }, data: { status: PositionHistoryPopulationRunStatus.RUNNING, startedAt: new Date(), leaseOwner: crypto.randomUUID(), leaseExpiresAt: new Date(Date.now() + 60_000) } });
    await assert.rejects(admin.create(browserActor, { to: new Date("2026-08-11T02:00:00.000Z"), windowBudget: 1000, excludeProviderDisabled: false }), PositionHistoryPopulationRunConflictError);
    assert.equal(await prisma.positionHistoryPopulationRun.count({ where: { id: { in: [...runIds] } } }), 1);
    await prisma.positionHistoryPopulationRun.update({ where: { id: first.id }, data: { status: PositionHistoryPopulationRunStatus.SUCCEEDED, finishedAt: new Date(), leaseOwner: null, leaseExpiresAt: null } });
    assert.equal(await admin.active(), null); assert.equal((await admin.recent()).some((run) => run.id === first.id && run.status === "SUCCEEDED"), true);
    const second = await admin.create(browserActor, { to: new Date("2026-08-11T02:00:00.000Z"), windowBudget: 5000, excludeProviderDisabled: false }); runIds.add(second.id);
    await prisma.positionHistoryPopulationRun.update({ where: { id: second.id }, data: { status: PositionHistoryPopulationRunStatus.FAILED, finishedAt: new Date(), safeFailureCode: "HISTORY_POPULATION_WORKER_FAILED" } });
    const afterFailure = await admin.create(browserActor, { to: new Date("2026-08-11T02:00:00.000Z"), windowBudget: 500, excludeProviderDisabled: true }); runIds.add(afterFailure.id);
    await prisma.positionHistoryPopulationRun.update({ where: { id: afterFailure.id }, data: { status: PositionHistoryPopulationRunStatus.SUCCEEDED, finishedAt: new Date() } });
    const recent = await admin.recent();
    assert.equal(recent.length <= 10, true); assert.equal(recent.some((run) => run.id === second.id && run.failureCategory === "WORKER"), true);
    assert.equal(recent.every((run) => run.status === "SUCCEEDED" || run.status === "FAILED"), true);
  } finally {
    await cleanup();
    assert.equal(await prisma.positionHistoryPopulationRun.count({ where: { id: { in: [...runIds] } } }), 0);
    assert.deepEqual(await authCounts(), beforeAuth);
    assert.deepEqual(await protectedSnapshot(), beforeProtected);
    assert.deepEqual(await auditDigest(), beforeAudit);
  }
});

test.after(async () => { await cleanup(); await prisma.$disconnect(); });
