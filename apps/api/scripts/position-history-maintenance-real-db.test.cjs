const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const { PrismaPg } = require("@prisma/adapter-pg");
const { AuthRole, PrismaClient, PositionHistoryPopulationRunInitiatorType, PositionHistoryPopulationRunStatus } = require("../dist/generated/prisma/client");
const { PositionHistoryMaintenanceService } = require("../dist/modules/position-history-population-runs/position-history-maintenance.service");
const { PositionHistoryPopulationRunCreationService } = require("../dist/modules/position-history-population-runs/position-history-population-run-creation.service");
const { AuditEventRepository } = require("../dist/modules/audit/audit.repository");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const database = { getClient: () => prisma };
const creation = new PositionHistoryPopulationRunCreationService(database, new AuditEventRepository(database));
const config = { positionHistoryMaintenance: { enabled: true } };
const runIds = new Set();
let userId = null;
const anchor = new Date("2026-08-13T10:00:00.000Z");
const protectedTables = ["vehicles", "vehicle_current_states", "daily_vehicle_stats", "vehicle_position_observations", "vehicle_position_backfill_checkpoints", "alert_evaluation_observations", "alert_events", "alert_notification_outbox", "application_settings"];

function eligiblePlan(remaining = 100) {
  return {
    horizon: { from: new Date("2026-05-13T02:00:00.000Z"), to: new Date("2026-08-11T02:00:00.000Z"), policyDays: 90 },
    targets: { total: 13, fullSevenDay: 12, remainderDurationMs: 6 * 24 * 60 * 60 * 1000 },
    fleet: { total: 1, providerDisabled: 0, providerEligible: 1 },
    targetVehiclePairs: { total: 13, completed: 12, incomplete: 1, providerEligibleIncomplete: 1 },
    estimatedRemainingHourlyWindows: remaining,
    slices: [],
  };
}

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

async function rememberActive() {
  const run = await prisma.positionHistoryPopulationRun.findFirst({ where: { status: { in: [PositionHistoryPopulationRunStatus.PENDING, PositionHistoryPopulationRunStatus.RUNNING] } } });
  assert.notEqual(run, null);
  runIds.add(run.id);
  return run;
}

function serviceWith(databaseValue = database, remaining = 100, calls = []) {
  const horizon = { run: async (to) => { calls.push(to.toISOString()); return eligiblePlan(remaining); } };
  return new PositionHistoryMaintenanceService(config, databaseValue, horizon, new PositionHistoryPopulationRunCreationService(databaseValue));
}

function racingDatabase(participants) {
  let arrived = 0;
  let release = () => undefined;
  const gate = new Promise((resolve) => { release = resolve; });
  const delegate = {
    findFirst: async (args) => {
      const result = await prisma.positionHistoryPopulationRun.findFirst(args);
      arrived += 1;
      if (arrived === participants) release();
      await gate;
      return result;
    },
    create: (args) => prisma.positionHistoryPopulationRun.create(args),
  };
  return { getClient: () => ({ positionHistoryPopulationRun: delegate }) };
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

test("Stage 18C PostgreSQL creation, active skip, terminal continuation and race remain provider-free and disposable", async () => {
  const beforeProtected = await protectedSnapshot();
  const beforeAuth = await authCounts();
  const beforeAudit = await auditDigest();
  assert.equal(await prisma.positionHistoryPopulationRun.count({ where: { status: { in: [PositionHistoryPopulationRunStatus.PENDING, PositionHistoryPopulationRunStatus.RUNNING] } } }), 0, "an unexplained active durable run exists");
  try {
    const migrations = await prisma.$queryRaw`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
    assert.equal(migrations.length, 11);

    const firstCalls = [];
    assert.equal((await serviceWith(database, 100, firstCalls).evaluate(anchor)).outcome, "CREATED");
    const first = await rememberActive();
    assert.equal(first.initiatorType, PositionHistoryPopulationRunInitiatorType.SYSTEM);
    assert.equal(first.requestedByUserId, null);
    assert.equal(first.status, PositionHistoryPopulationRunStatus.PENDING);
    assert.equal(first.windowBudget, 5_000);
    assert.equal(first.committedWindows, 0);
    assert.equal(first.excludeProviderDisabled, true);
    assert.equal(first.to.toISOString(), "2026-08-11T02:00:00.000Z");
    assert.deepEqual(firstCalls, ["2026-08-11T02:00:00.000Z"]);
    await prisma.positionHistoryPopulationRun.update({ where: { id: first.id }, data: { status: PositionHistoryPopulationRunStatus.FAILED, finishedAt: new Date(), safeFailureCode: "TEST_ONLY" } });

    const marker = crypto.randomUUID();
    const user = await prisma.authUser.create({ data: { login: `stage18c-${marker}`, normalizedLogin: `stage18c-${marker}`, passwordHash: new Uint8Array(32), passwordSalt: new Uint8Array(16), passwordHashVersion: 1, role: AuthRole.USER, disabled: false, mustChangePassword: false } });
    userId = user.id;
    const userRun = await creation.createRun({ initiatorType: PositionHistoryPopulationRunInitiatorType.USER, requestedByUserId: user.id, requestedByLoginSnapshot: user.login, to: new Date("2026-08-11T02:00:00.000Z"), excludeProviderDisabled: true, windowBudget: 500 });
    runIds.add(userRun.id);
    const skipCalls = [];
    assert.equal((await serviceWith(database, 100, skipCalls).evaluate(anchor)).outcome, "ACTIVE_RUN");
    assert.deepEqual(skipCalls, []);
    assert.equal((await prisma.positionHistoryPopulationRun.findUnique({ where: { id: userRun.id } })).status, PositionHistoryPopulationRunStatus.PENDING);
    await prisma.positionHistoryPopulationRun.update({ where: { id: userRun.id }, data: { status: PositionHistoryPopulationRunStatus.FAILED, finishedAt: new Date(), safeFailureCode: "TEST_ONLY" } });

    const afterFailed = await serviceWith().evaluate(anchor);
    assert.equal(afterFailed.outcome, "CREATED");
    const next = await rememberActive();
    assert.notEqual(next.id, first.id);
    assert.equal((await prisma.positionHistoryPopulationRun.findUnique({ where: { id: first.id } })).status, PositionHistoryPopulationRunStatus.FAILED);
    await prisma.positionHistoryPopulationRun.update({ where: { id: next.id }, data: { status: PositionHistoryPopulationRunStatus.SUCCEEDED, finishedAt: new Date() } });

    const raceDatabase = racingDatabase(2);
    const outcomes = await Promise.all([serviceWith(raceDatabase).evaluate(anchor), serviceWith(raceDatabase).evaluate(anchor)]);
    assert.deepEqual(outcomes.map((value) => value.outcome).sort(), ["CREATED", "CREATION_RACE_LOST"]);
    const raceWinner = await rememberActive();
    assert.equal(raceWinner.initiatorType, PositionHistoryPopulationRunInitiatorType.SYSTEM);
    assert.equal(await prisma.positionHistoryPopulationRun.count({ where: { status: { in: [PositionHistoryPopulationRunStatus.PENDING, PositionHistoryPopulationRunStatus.RUNNING] } } }), 1);
  } finally {
    await cleanup();
    assert.equal(await prisma.positionHistoryPopulationRun.count({ where: { id: { in: [...runIds] } } }), 0);
    assert.deepEqual(await authCounts(), beforeAuth);
    assert.deepEqual(await protectedSnapshot(), beforeProtected);
    assert.deepEqual(await auditDigest(), beforeAudit);
  }
});

test.after(async () => { await cleanup(); await prisma.$disconnect(); });
