const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient, AuthRole, AuditActorType, AuditEventType, AuditTargetType, PositionHistoryPopulationRunInitiatorType, PositionHistoryPopulationRunStatus } = require("../dist/generated/prisma/client");
const { AuditEventRepository } = require("../dist/modules/audit/audit.repository");
const { AdminUsersService } = require("../dist/modules/auth/admin-users.service");
const { PositionHistoryPopulationRunCreationService } = require("../dist/modules/position-history-population-runs/position-history-population-run-creation.service");
const { PositionHistoryPopulationRunAdminService } = require("../dist/modules/position-history-population-runs/position-history-population-run-admin.service");
const { PositionHistoryHorizonExecutionLockService } = require("../dist/modules/position-history-horizon-execution/position-history-horizon-execution-lock.service");
const { PrismaPositionHistoryRetentionRepository } = require("../dist/modules/position-history-retention/prisma-position-history-retention.repository");
const { PositionHistoryRetentionService } = require("../dist/modules/position-history-retention/position-history-retention.service");
const { Client } = require("pg");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const database = { getClient: () => prisma };
const auditRepository = new AuditEventRepository(database);
const security = { generatePassword: () => "A".repeat(24), hashPassword: async () => ({ version: 1, salt: new Uint8Array(16), hash: new Uint8Array(32) }) };
const adminUsers = new AdminUsersService(database, security, auditRepository);
const populationCreation = new PositionHistoryPopulationRunCreationService(database, auditRepository);
const populationAdmin = new PositionHistoryPopulationRunAdminService(database, populationCreation);

const fixtureVehicleId = crypto.randomUUID();
const marker = crypto.randomUUID();
const loginPrefix = `stage20a-${marker}`;
const createdAuthUserIds = [];
const createdRunIds = [];
const createdAuditIds = [];
const protectedTables = [
  "auth_users", "auth_user_permissions", "auth_sessions",
  "vehicles", "vehicle_current_states", "daily_vehicle_stats",
  "vehicle_position_observations", "vehicle_position_backfill_checkpoints",
  "position_history_population_runs", "audit_events", "application_settings",
];

async function exactSnapshot() {
  const result = {};
  for (const table of protectedTables) {
    const rows = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*)::text AS count,
             md5(COALESCE(string_agg(to_jsonb(row_data)::text, E'\\n' ORDER BY to_jsonb(row_data)::text), '')) AS digest
      FROM "${table}" AS row_data
    `);
    result[table] = rows[0];
  }
  return result;
}

function user(login, role) {
  return {
    login,
    normalizedLogin: login.toLowerCase(),
    role,
    disabled: false,
    mustChangePassword: false,
    passwordHashVersion: 1,
    passwordSalt: new Uint8Array(16),
    passwordHash: new Uint8Array(32),
  };
}

function lockService() {
  return new PositionHistoryHorizonExecutionLockService(async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    return { query: (text, values) => client.query(text, [...values]), release: () => client.end() };
  });
}

function actor(id, login) {
  return { actorType: "USER", actorUserId: id, actorLoginSnapshot: login };
}

function fingerprint(label) {
  return crypto.createHash("sha256").update(`${marker}:${label}`).digest("hex");
}

function at(base, hours) {
  return new Date(base.getTime() + hours * 60 * 60 * 1000);
}

async function captureAuditIds(where) {
  const rows = await prisma.auditEvent.findMany({ where, select: { id: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  for (const row of rows) createdAuditIds.push(row.id);
}

async function assertAuditReadback(id, expected) {
  const row = await prisma.auditEvent.findUniqueOrThrow({ where: { id } });
  assert.equal(row.eventType, expected.eventType);
  assert.equal(row.actorType, expected.actorType);
  assert.equal(row.actorUserId, expected.actorUserId);
  assert.equal(row.actorLoginSnapshot, expected.actorLoginSnapshot);
  assert.equal(row.targetType, expected.targetType);
  assert.equal(row.targetId, expected.targetId);
  assert.deepEqual(JSON.parse(JSON.stringify(row.details)), expected.details);
}

async function cleanupFixture() {
  await prisma.vehiclePositionObservation.deleteMany({ where: { vehicleId: fixtureVehicleId } });
  await prisma.vehiclePositionBackfillCheckpoint.deleteMany({ where: { vehicleId: fixtureVehicleId } });
  await prisma.vehicle.deleteMany({ where: { id: fixtureVehicleId, name: `${loginPrefix}-vehicle` } });
  if (createdRunIds.length > 0) await prisma.positionHistoryPopulationRun.deleteMany({ where: { id: { in: createdRunIds } } });
  if (createdAuditIds.length > 0) await prisma.auditEvent.deleteMany({ where: { id: { in: createdAuditIds } } });
  if (createdAuthUserIds.length > 0) {
    await prisma.authSession.deleteMany({ where: { userId: { in: createdAuthUserIds } } });
    await prisma.authUserPermission.deleteMany({ where: { userId: { in: createdAuthUserIds } } });
    await prisma.authUser.deleteMany({ where: { id: { in: createdAuthUserIds } } });
  }
}

test("Stage 20A real PostgreSQL audit trail foundation with disposable fixtures", async () => {
  await cleanupFixture();
  const before = await exactSnapshot();
  const beforeAuditCount = Number((await prisma.$queryRaw`SELECT COUNT(*)::bigint AS count FROM "audit_events"`)[0].count);
  assert.equal(await prisma.positionHistoryPopulationRun.count({ where: { status: { in: [PositionHistoryPopulationRunStatus.PENDING, PositionHistoryPopulationRunStatus.RUNNING] } } }), 0, "unexplained active durable run exists");
  const baselineRepository = new PrismaPositionHistoryRetentionRepository(database);
  const baselinePlanner = new PositionHistoryRetentionService(baselineRepository, { now: () => new Date() }, lockService(), auditRepository);
  const businessPlan = await baselinePlanner.getRetentionPlan();
  assert.equal(businessPlan.checkpoints.fullyObsolete, 0, "pre-existing business checkpoint candidates prohibit destructive validation");
  assert.equal(businessPlan.observations.executableObservationCandidates, 0, "pre-existing business observation candidates prohibit destructive validation");

  try {
    // USER_DISABLED integration.
    const admin = await prisma.authUser.create({ data: user(`${loginPrefix}-admin`, AuthRole.ADMIN) });
    const target = await prisma.authUser.create({ data: user(`${loginPrefix}-target`, AuthRole.USER) });
    createdAuthUserIds.push(admin.id, target.id);
    await prisma.authSession.create({ data: { userId: target.id, tokenHash: crypto.randomBytes(32), expiresAt: new Date(Date.now() + 60_000) } });
    const disabled = await adminUsers.disable(actor(admin.id, admin.login), target.id);
    assert.equal(disabled.disabled, true);
    assert.equal(await prisma.authSession.count({ where: { userId: target.id } }), 0);
    await captureAuditIds({ eventType: "USER_DISABLED", actorUserId: admin.id, targetId: target.id });
    assert.equal(createdAuditIds.length, 1);
    await assertAuditReadback(createdAuditIds.at(-1), {
      eventType: AuditEventType.USER_DISABLED,
      actorType: AuditActorType.USER,
      actorUserId: admin.id,
      actorLoginSnapshot: admin.login,
      targetType: AuditTargetType.USER,
      targetId: target.id,
      details: { targetLoginSnapshot: target.login },
    });

    // DURABLE_POPULATION_CREATED integration.
    const operator = await prisma.authUser.create({ data: user(`${loginPrefix}-operator`, AuthRole.USER) });
    createdAuthUserIds.push(operator.id);
    const run = await populationAdmin.create(actor(operator.id, operator.login), { to: new Date(businessPlan.canonicalAnchor), windowBudget: 500, excludeProviderDisabled: true });
    createdRunIds.push(run.id);
    assert.equal(run.initiatorType, PositionHistoryPopulationRunInitiatorType.USER);
    assert.equal(run.status, PositionHistoryPopulationRunStatus.PENDING);
    await captureAuditIds({ eventType: "DURABLE_POPULATION_CREATED", actorUserId: operator.id, targetId: run.id });
    assert.equal(createdAuditIds.length, 2);
    await assertAuditReadback(createdAuditIds.at(-1), {
      eventType: AuditEventType.DURABLE_POPULATION_CREATED,
      actorType: AuditActorType.USER,
      actorUserId: operator.id,
      actorLoginSnapshot: operator.login,
      targetType: AuditTargetType.POSITION_HISTORY_POPULATION_RUN,
      targetId: run.id,
      details: { to: new Date(businessPlan.canonicalAnchor).toISOString(), windowBudget: 500, excludeProviderDisabled: true },
    });
    assert.equal(await prisma.positionHistoryPopulationRun.count({ where: { status: { in: [PositionHistoryPopulationRunStatus.PENDING, PositionHistoryPopulationRunStatus.RUNNING] } } }), 1);
    await prisma.positionHistoryPopulationRun.update({ where: { id: run.id }, data: { status: PositionHistoryPopulationRunStatus.SUCCEEDED, finishedAt: new Date(), leaseOwner: null, leaseExpiresAt: null } });

    // RETENTION_EXECUTED integration. Use a disposable synthetic history vehicle only.
    let externalDeviceId = 2_000_000_000 + Math.floor(Math.random() * 100_000_000);
    while (await prisma.vehicle.count({ where: { externalDeviceId } })) externalDeviceId += 1;
    await prisma.vehicle.create({ data: { id: fixtureVehicleId, externalDeviceId, name: `${loginPrefix}-vehicle`, disabled: true } });
    const cutoff = new Date(businessPlan.policyCutoff);
    const obsoleteCheckpoint = crypto.randomUUID();
    const protectedCheckpoint = crypto.randomUUID();
    await prisma.vehiclePositionBackfillCheckpoint.createMany({ data: [
      { id: obsoleteCheckpoint, vehicleId: fixtureVehicleId, rangeFrom: at(cutoff, -72), rangeTo: at(cutoff, -48), nextFrom: at(cutoff, -48), status: "COMPLETED" },
      { id: protectedCheckpoint, vehicleId: fixtureVehicleId, rangeFrom: cutoff, rangeTo: at(cutoff, 24), nextFrom: cutoff, status: "PENDING" },
    ] });
    await prisma.vehiclePositionObservation.createMany({ data: [
      { id: crypto.randomUUID(), vehicleId: fixtureVehicleId, fixFingerprint: fingerprint("obsolete-1"), observedAt: at(cutoff, -60), latitude: 0.1, longitude: 0.1, fetchedAt: cutoff, ingestionSource: "HISTORICAL_BACKFILL" },
      { id: crypto.randomUUID(), vehicleId: fixtureVehicleId, fixFingerprint: fingerprint("obsolete-2"), observedAt: at(cutoff, -36), latitude: 0.2, longitude: 0.2, fetchedAt: cutoff, ingestionSource: "HISTORICAL_BACKFILL" },
      { id: crypto.randomUUID(), vehicleId: fixtureVehicleId, fixFingerprint: fingerprint("protected"), observedAt: cutoff, latitude: 0.3, longitude: 0.3, fetchedAt: cutoff, ingestionSource: "HISTORICAL_BACKFILL" },
    ] });

    const retentionRepository = new PrismaPositionHistoryRetentionRepository(database);
    const retentionService = new PositionHistoryRetentionService(retentionRepository, { now: () => new Date() }, lockService(), auditRepository);
    const fixturePlan = await retentionService.getRetentionPlan();
    assert.equal(fixturePlan.checkpoints.fullyObsolete, 1);
    assert.equal(fixturePlan.observations.executableObservationCandidates, 2);
    const retentionResult = await retentionService.executeRetention(
      { expectedCanonicalAnchor: new Date(fixturePlan.canonicalAnchor), expectedPolicyCutoff: new Date(fixturePlan.policyCutoff) },
      actor(admin.id, admin.login),
    );
    assert.equal(retentionResult.deletedCheckpoints, 1);
    assert.equal(retentionResult.deletedObservations, 2);
    assert.equal(await prisma.vehiclePositionBackfillCheckpoint.count({ where: { id: obsoleteCheckpoint } }), 0);
    assert.equal(await prisma.vehiclePositionBackfillCheckpoint.count({ where: { id: protectedCheckpoint } }), 1);
    assert.equal(await prisma.vehiclePositionObservation.count({ where: { vehicleId: fixtureVehicleId, observedAt: { lt: cutoff } } }), 0);
    assert.equal(await prisma.vehiclePositionObservation.count({ where: { vehicleId: fixtureVehicleId, observedAt: { gte: cutoff } } }), 1);
    await captureAuditIds({ eventType: "RETENTION_EXECUTED", actorUserId: admin.id, targetId: null });
    assert.equal(createdAuditIds.length, 3);
    await assertAuditReadback(createdAuditIds.at(-1), {
      eventType: AuditEventType.RETENTION_EXECUTED,
      actorType: AuditActorType.USER,
      actorUserId: admin.id,
      actorLoginSnapshot: admin.login,
      targetType: AuditTargetType.POSITION_HISTORY_RETENTION,
      targetId: null,
      details: {
        canonicalAnchor: retentionResult.canonicalAnchor,
        policyCutoff: retentionResult.policyCutoff,
        deletedCheckpoints: retentionResult.deletedCheckpoints,
        deletedObservations: retentionResult.deletedObservations,
        remainingFullyObsoleteCheckpoints: retentionResult.remainingFullyObsoleteCheckpoints,
        remainingExecutableObservationCandidates: retentionResult.remainingExecutableObservationCandidates,
        stoppedByBudget: retentionResult.stoppedByBudget,
      },
    });
  } finally {
    await cleanupFixture();
    const after = await exactSnapshot();
    assert.deepEqual(after, before);
    assert.equal(Number((await prisma.$queryRaw`SELECT COUNT(*)::bigint AS count FROM "audit_events"`)[0].count), beforeAuditCount);
    process.stdout.write(`${JSON.stringify({ fixtureVehicleId, beforeAuditCount, auditEventsCreated: createdAuditIds.length, preExistingBusinessIdentical: true, externalRequests: 0 }, null, 2)}\n`);
  }
});

test.after(async () => {
  await cleanupFixture();
  await prisma.$disconnect();
});
