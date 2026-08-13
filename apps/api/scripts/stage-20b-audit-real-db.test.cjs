const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Client } = require("pg");
const {
  PrismaClient,
  AuditActorType,
  AuditEventType,
  AuditTargetType,
  AuthRole,
  PositionHistoryPopulationRunInitiatorType,
  PositionHistoryPopulationRunStatus,
} = require("../dist/generated/prisma/client");
const { AuditEventRepository } = require("../dist/modules/audit/audit.repository");
const { AdminUsersService, DEFAULT_ADMIN_USER_SECURITY } = require("../dist/modules/auth/admin-users.service");
const { AuthService } = require("../dist/modules/auth/auth.service");
const { hashPassword } = require("../dist/modules/auth/password");
const { PositionHistoryHorizonExecutionService } = require("../dist/modules/position-history-horizon-execution/position-history-horizon-execution.service");
const { PositionHistoryHorizonExecutionLockService } = require("../dist/modules/position-history-horizon-execution/position-history-horizon-execution-lock.service");
const { PositionHistoryPopulationRunCreationService } = require("../dist/modules/position-history-population-runs/position-history-population-run-creation.service");
const { PositionHistoryMaintenanceService } = require("../dist/modules/position-history-population-runs/position-history-maintenance.service");
const { PrismaPositionHistoryRetentionRepository } = require("../dist/modules/position-history-retention/prisma-position-history-retention.repository");
const { PositionHistoryRetentionService } = require("../dist/modules/position-history-retention/position-history-retention.service");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const database = { getClient: () => prisma };
const auditRepository = new AuditEventRepository(database);
const adminUsers = new AdminUsersService(database, DEFAULT_ADMIN_USER_SECURITY, auditRepository);
const auth = new AuthService(database, auditRepository);
const populationCreation = new PositionHistoryPopulationRunCreationService(database, auditRepository);

const marker = crypto.randomUUID();
const loginPrefix = `stage20b-${marker}`;
const fixtureVehicleId = crypto.randomUUID();
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

function actor(id, login) {
  return { actorType: "USER", actorUserId: id, actorLoginSnapshot: login };
}

async function user(login, role) {
  const material = await hashPassword("fixture current password value");
  return {
    login,
    normalizedLogin: login.toLowerCase(),
    role,
    disabled: false,
    mustChangePassword: false,
    passwordHashVersion: material.version,
    passwordSalt: new Uint8Array(material.salt),
    passwordHash: new Uint8Array(material.hash),
  };
}

function lockService() {
  return new PositionHistoryHorizonExecutionLockService(async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    return { query: (text, values) => client.query(text, [...values]), release: () => client.end() };
  });
}

function at(base, hours) {
  return new Date(base.getTime() + hours * 60 * 60 * 1000);
}

function fingerprint(label) {
  return crypto.createHash("sha256").update(`${marker}:${label}`).digest("hex");
}

async function captureAudit(where) {
  const row = await prisma.auditEvent.findFirst({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  assert.ok(row, `missing audit event ${where.eventType}`);
  if (!createdAuditIds.includes(row.id)) createdAuditIds.push(row.id);
  return row;
}

function assertAudit(row, expected) {
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
  const fixtureAuditOwnership = [];
  if (createdAuditIds.length > 0) fixtureAuditOwnership.push({ id: { in: createdAuditIds } });
  if (createdAuthUserIds.length > 0) fixtureAuditOwnership.push({ actorUserId: { in: createdAuthUserIds } }, { targetType: AuditTargetType.USER, targetId: { in: createdAuthUserIds } });
  if (createdRunIds.length > 0) fixtureAuditOwnership.push({ targetType: AuditTargetType.POSITION_HISTORY_POPULATION_RUN, targetId: { in: createdRunIds } });
  if (fixtureAuditOwnership.length > 0) await prisma.auditEvent.deleteMany({ where: { OR: fixtureAuditOwnership } });
  if (createdRunIds.length > 0) await prisma.positionHistoryPopulationRun.deleteMany({ where: { id: { in: createdRunIds } } });
  if (createdAuthUserIds.length > 0) {
    await prisma.authSession.deleteMany({ where: { userId: { in: createdAuthUserIds } } });
    await prisma.authUserPermission.deleteMany({ where: { userId: { in: createdAuthUserIds } } });
    await prisma.authUser.deleteMany({ where: { id: { in: createdAuthUserIds } } });
  }
}

test("Stage 20B complete audit integration uses only disposable PostgreSQL fixtures", async () => {
  await cleanupFixture();
  const before = await exactSnapshot();
  const beforeAuditCount = await prisma.auditEvent.count();
  assert.equal(await prisma.positionHistoryPopulationRun.count({ where: { status: { in: [PositionHistoryPopulationRunStatus.PENDING, PositionHistoryPopulationRunStatus.RUNNING] } } }), 0, "unexplained active durable run exists");

  const baselineRepository = new PrismaPositionHistoryRetentionRepository(database);
  const baselineRetention = new PositionHistoryRetentionService(baselineRepository, { now: () => new Date() }, lockService(), auditRepository);
  const baselinePlan = await baselineRetention.getRetentionPlan();
  assert.equal(baselinePlan.checkpoints.fullyObsolete, 0, "pre-existing checkpoint candidates prohibit destructive fixture validation");
  assert.equal(baselinePlan.observations.executableObservationCandidates, 0, "pre-existing observation candidates prohibit destructive fixture validation");

  try {
    const admin = await prisma.authUser.create({ data: await user(`${loginPrefix}-admin`, AuthRole.ADMIN) });
    createdAuthUserIds.push(admin.id);
    const adminActor = actor(admin.id, admin.login);

    const created = await adminUsers.create(adminActor, { login: `${loginPrefix}-user`, role: AuthRole.USER, permissions: ["reports.view"] });
    createdAuthUserIds.push(created.user.id);
    const createdEvent = await captureAudit({ eventType: AuditEventType.USER_CREATED, actorUserId: admin.id, targetId: created.user.id });
    assertAudit(createdEvent, {
      eventType: AuditEventType.USER_CREATED,
      actorType: AuditActorType.USER,
      actorUserId: admin.id,
      actorLoginSnapshot: admin.login,
      targetType: AuditTargetType.USER,
      targetId: created.user.id,
      details: { targetLoginSnapshot: created.user.login, role: AuthRole.USER, permissions: ["reports.view"] },
    });
    assert.equal(JSON.stringify(createdEvent.details).includes("password"), false);

    await adminUsers.updateAccess(adminActor, created.user.id, { role: AuthRole.USER, permissions: ["trips.view"] });
    const accessEvent = await captureAudit({ eventType: AuditEventType.USER_ACCESS_CHANGED, actorUserId: admin.id, targetId: created.user.id });
    assertAudit(accessEvent, {
      eventType: AuditEventType.USER_ACCESS_CHANGED,
      actorType: AuditActorType.USER,
      actorUserId: admin.id,
      actorLoginSnapshot: admin.login,
      targetType: AuditTargetType.USER,
      targetId: created.user.id,
      details: { targetLoginSnapshot: created.user.login, previousRole: AuthRole.USER, role: AuthRole.USER, previousPermissions: ["reports.view"], permissions: ["vehicles.view", "trips.view"] },
    });

    await prisma.authUser.update({ where: { id: created.user.id }, data: { disabled: true } });
    await adminUsers.enable(adminActor, created.user.id);
    const enabledEvent = await captureAudit({ eventType: AuditEventType.USER_ENABLED, actorUserId: admin.id, targetId: created.user.id });
    assertAudit(enabledEvent, {
      eventType: AuditEventType.USER_ENABLED,
      actorType: AuditActorType.USER,
      actorUserId: admin.id,
      actorLoginSnapshot: admin.login,
      targetType: AuditTargetType.USER,
      targetId: created.user.id,
      details: { targetLoginSnapshot: created.user.login },
    });

    await prisma.authSession.create({ data: { userId: created.user.id, tokenHash: crypto.randomBytes(32), expiresAt: new Date(Date.now() + 60_000) } });
    const reset = await adminUsers.resetPassword(adminActor, created.user.id);
    assert.equal(await prisma.authSession.count({ where: { userId: created.user.id } }), 0);
    const resetEvent = await captureAudit({ eventType: AuditEventType.USER_PASSWORD_RESET, actorUserId: admin.id, targetId: created.user.id });
    assertAudit(resetEvent, {
      eventType: AuditEventType.USER_PASSWORD_RESET,
      actorType: AuditActorType.USER,
      actorUserId: admin.id,
      actorLoginSnapshot: admin.login,
      targetType: AuditTargetType.USER,
      targetId: created.user.id,
      details: { targetLoginSnapshot: created.user.login },
    });
    assert.equal(JSON.stringify(resetEvent.details).includes("password"), false);

    const principal = { id: created.user.id, login: created.user.login, role: AuthRole.USER, permissions: ["vehicles.view", "trips.view"], mustChangePassword: true, sessionTokenHash: crypto.randomBytes(32) };
    await auth.changePassword(principal, reset.temporaryPassword, "fixture next password value");
    const ownEvent = await captureAudit({ eventType: AuditEventType.OWN_PASSWORD_CHANGED, actorUserId: created.user.id, targetId: created.user.id });
    assertAudit(ownEvent, {
      eventType: AuditEventType.OWN_PASSWORD_CHANGED,
      actorType: AuditActorType.USER,
      actorUserId: created.user.id,
      actorLoginSnapshot: created.user.login,
      targetType: AuditTargetType.USER,
      targetId: created.user.id,
      details: {},
    });

    const shortRunner = { run: async () => ({ horizonFrom: new Date("2026-05-13T02:00:00.000Z"), horizonTo: new Date("2026-08-11T02:00:00.000Z"), policyDays: 90, slicesTotal: 13, slicesVisited: 1, slicesAlreadyComplete: 0, providerDisabledExcluded: 0, windowsRequested: 4, providerRequests: 0, providerRows: 0, candidates: 0, inserted: 0, duplicates: 0, invalid: 0, retries: 0, rateLimitResponses: 0, stoppedByBudget: false, horizonComplete: false, currentSliceFrom: new Date("2026-08-04T02:00:00.000Z"), currentSliceTo: new Date("2026-08-11T02:00:00.000Z") }) };
    const short = new PositionHistoryHorizonExecutionService(shortRunner, auditRepository);
    const shortRequest = { requestedTo: "2026-08-11T02:00:00.000Z", to: new Date("2026-08-11T02:00:00.000Z"), maxWindows: 6, excludeProviderDisabled: true };
    await short.run(shortRequest, actor(created.user.id, created.user.login));
    const shortEvent = await captureAudit({ eventType: AuditEventType.SHORT_POPULATION_EXECUTED, actorUserId: created.user.id, targetId: null });
    assertAudit(shortEvent, {
      eventType: AuditEventType.SHORT_POPULATION_EXECUTED,
      actorType: AuditActorType.USER,
      actorUserId: created.user.id,
      actorLoginSnapshot: created.user.login,
      targetType: AuditTargetType.POSITION_HISTORY,
      targetId: null,
      details: { to: shortRequest.requestedTo, windowBudget: 6, excludeProviderDisabled: true, committedWindows: 4 },
    });

    const anchor = new Date(baselinePlan.canonicalAnchor);
    const horizon = { run: async () => ({ estimatedRemainingHourlyWindows: 1 }) };
    const maintenance = new PositionHistoryMaintenanceService({ positionHistoryMaintenance: { enabled: true } }, database, horizon, populationCreation);
    assert.equal((await maintenance.evaluate(new Date(anchor.getTime() + 60 * 60 * 1000))).outcome, "CREATED");
    const systemRun = await prisma.positionHistoryPopulationRun.findFirstOrThrow({ where: { initiatorType: PositionHistoryPopulationRunInitiatorType.SYSTEM, to: anchor }, orderBy: { createdAt: "desc" } });
    createdRunIds.push(systemRun.id);
    const systemEvent = await captureAudit({ eventType: AuditEventType.SYSTEM_POPULATION_CREATED, targetId: systemRun.id });
    assertAudit(systemEvent, {
      eventType: AuditEventType.SYSTEM_POPULATION_CREATED,
      actorType: AuditActorType.SYSTEM,
      actorUserId: null,
      actorLoginSnapshot: null,
      targetType: AuditTargetType.POSITION_HISTORY_POPULATION_RUN,
      targetId: systemRun.id,
      details: { to: anchor.toISOString(), windowBudget: 5_000, excludeProviderDisabled: true },
    });
    await prisma.positionHistoryPopulationRun.update({ where: { id: systemRun.id }, data: { status: PositionHistoryPopulationRunStatus.SUCCEEDED, finishedAt: new Date() } });

    let externalDeviceId = 2_000_000_000 + Math.floor(Math.random() * 100_000_000);
    while (await prisma.vehicle.count({ where: { externalDeviceId } })) externalDeviceId += 1;
    await prisma.vehicle.create({ data: { id: fixtureVehicleId, externalDeviceId, name: `${loginPrefix}-vehicle`, disabled: true } });
    const cutoff = new Date(baselinePlan.policyCutoff);
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
    const retention = new PositionHistoryRetentionService(new PrismaPositionHistoryRetentionRepository(database), { now: () => new Date() }, lockService(), auditRepository);
    const result = await retention.executeAutomaticRetention();
    assert.equal(result.deletedCheckpoints, 1);
    assert.equal(result.deletedObservations, 2);
    const automaticEvent = await captureAudit({ eventType: AuditEventType.AUTOMATIC_RETENTION_EXECUTED, targetId: null });
    assertAudit(automaticEvent, {
      eventType: AuditEventType.AUTOMATIC_RETENTION_EXECUTED,
      actorType: AuditActorType.SYSTEM,
      actorUserId: null,
      actorLoginSnapshot: null,
      targetType: AuditTargetType.POSITION_HISTORY_RETENTION,
      targetId: null,
      details: { canonicalAnchor: result.canonicalAnchor, policyCutoff: result.policyCutoff, deletedCheckpoints: result.deletedCheckpoints, deletedObservations: result.deletedObservations, remainingFullyObsoleteCheckpoints: result.remainingFullyObsoleteCheckpoints, remainingExecutableObservationCandidates: result.remainingExecutableObservationCandidates, stoppedByBudget: result.stoppedByBudget },
    });
  } finally {
    await cleanupFixture();
    assert.deepEqual(await exactSnapshot(), before);
    assert.equal(await prisma.auditEvent.count(), beforeAuditCount);
    process.stdout.write(`${JSON.stringify({ auditEventsCreated: createdAuditIds.length, preExistingDataIdentical: true, exactFixtureCleanup: true, externalRequests: 0 })}\n`);
  }
});

test.after(async () => {
  await cleanupFixture();
  await prisma.$disconnect();
});
