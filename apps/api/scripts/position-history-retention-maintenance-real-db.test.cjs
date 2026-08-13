const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("../dist/generated/prisma/client");
const { PositionHistoryHorizonExecutionLockService } = require("../dist/modules/position-history-horizon-execution/position-history-horizon-execution-lock.service");
const { PositionHistoryRetentionMaintenanceService } = require("../dist/modules/position-history-retention/position-history-retention-maintenance.service");
const { PrismaPositionHistoryRetentionRepository } = require("../dist/modules/position-history-retention/prisma-position-history-retention.repository");
const { PositionHistoryRetentionService } = require("../dist/modules/position-history-retention/position-history-retention.service");
const { Client } = require("pg");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const database = { getClient: () => prisma };
const fixtureVehicleId = crypto.randomUUID();
const fixtureRunId = crypto.randomUUID();
const fixturePrefix = `stage-19c-retention-${fixtureVehicleId}`;
const protectedTables = [
  "vehicles", "vehicle_current_states", "daily_vehicle_stats", "vehicle_position_observations", "vehicle_position_backfill_checkpoints",
  "position_history_population_runs", "alert_evaluation_observations", "alert_events", "alert_notification_outbox", "application_settings",
  "auth_users", "auth_user_permissions", "auth_sessions",
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

async function cleanupFixture() {
  await prisma.positionHistoryPopulationRun.deleteMany({ where: { id: fixtureRunId } });
  await prisma.vehiclePositionObservation.deleteMany({ where: { vehicleId: fixtureVehicleId } });
  await prisma.vehiclePositionBackfillCheckpoint.deleteMany({ where: { vehicleId: fixtureVehicleId } });
  await prisma.vehicle.deleteMany({ where: { id: fixtureVehicleId, name: fixturePrefix } });
}

function fingerprint(label) { return crypto.createHash("sha256").update(`${fixturePrefix}:${label}`).digest("hex"); }
function at(base, hours) { return new Date(base.getTime() + hours * 60 * 60 * 1_000); }
function lockService() {
  return new PositionHistoryHorizonExecutionLockService(async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    return { query: (text, values) => client.query(text, [...values]), release: () => client.end() };
  });
}

test("Stage 19C internal automatic service uses one real shared-core pass on disposable PostgreSQL fixtures only", async () => {
  await cleanupFixture();
  const before = await exactSnapshot();
  let report;
  try {
    assert.equal((await prisma.$queryRaw`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`).length, 11);
    assert.equal(await prisma.positionHistoryPopulationRun.count({ where: { status: { in: ["PENDING", "RUNNING"] } } }), 0);

    const repository = new PrismaPositionHistoryRetentionRepository(database);
    const retention = new PositionHistoryRetentionService(repository, { now: () => new Date() }, lockService());
    let automaticCalls = 0;
    const countedRetention = {
      getRetentionPlan: () => retention.getRetentionPlan(),
      executeAutomaticRetention: () => { automaticCalls += 1; return retention.executeAutomaticRetention(); },
    };
    const automatic = new PositionHistoryRetentionMaintenanceService({ positionHistoryRetention: { enabled: true } }, countedRetention);

    const businessPlan = await retention.getRetentionPlan();
    assert.equal(businessPlan.checkpoints.fullyObsolete, 0, "pre-existing business checkpoint candidates prohibit destructive validation");
    assert.equal(businessPlan.observations.executableObservationCandidates, 0, "pre-existing business observation candidates prohibit destructive validation");
    assert.deepEqual(await automatic.evaluate(), { outcome: "NO_WORK", result: null });
    assert.equal(automaticCalls, 0);

    const cutoff = new Date(businessPlan.policyCutoff);
    let externalDeviceId = 2_000_000_000 + Math.floor(Math.random() * 100_000_000);
    while (await prisma.vehicle.count({ where: { externalDeviceId } })) externalDeviceId += 1;
    await prisma.vehicle.create({ data: { id: fixtureVehicleId, externalDeviceId, name: fixturePrefix, disabled: true } });

    const checkpoint = { obsolete: crypto.randomUUID(), boundary: crypto.randomUUID(), protected: crypto.randomUUID() };
    await prisma.vehiclePositionBackfillCheckpoint.createMany({ data: [
      { id: checkpoint.obsolete, vehicleId: fixtureVehicleId, rangeFrom: at(cutoff, -72), rangeTo: at(cutoff, -48), nextFrom: at(cutoff, -48), status: "COMPLETED" },
      { id: checkpoint.boundary, vehicleId: fixtureVehicleId, rangeFrom: at(cutoff, -24), rangeTo: cutoff, nextFrom: at(cutoff, -12), status: "RUNNING" },
      { id: checkpoint.protected, vehicleId: fixtureVehicleId, rangeFrom: cutoff, rangeTo: at(cutoff, 24), nextFrom: cutoff, status: "PENDING" },
    ] });
    const observation = { obsolete: crypto.randomUUID(), boundary: crypto.randomUUID(), uncovered: crypto.randomUUID(), exact: crypto.randomUUID(), newer: crypto.randomUUID() };
    await prisma.vehiclePositionObservation.createMany({ data: [
      { id: observation.obsolete, vehicleId: fixtureVehicleId, fixFingerprint: fingerprint("obsolete"), observedAt: at(cutoff, -60), latitude: 0.1, longitude: 0.1, fetchedAt: cutoff, ingestionSource: "HISTORICAL_BACKFILL" },
      { id: observation.boundary, vehicleId: fixtureVehicleId, fixFingerprint: fingerprint("boundary"), observedAt: at(cutoff, -12), latitude: 0.1, longitude: 0.1, fetchedAt: cutoff, ingestionSource: "HISTORICAL_BACKFILL" },
      { id: observation.uncovered, vehicleId: fixtureVehicleId, fixFingerprint: fingerprint("uncovered"), observedAt: at(cutoff, -36), latitude: 0.1, longitude: 0.1, fetchedAt: cutoff, ingestionSource: "HISTORICAL_BACKFILL" },
      { id: observation.exact, vehicleId: fixtureVehicleId, fixFingerprint: fingerprint("exact"), observedAt: cutoff, latitude: 0.1, longitude: 0.1, fetchedAt: cutoff, ingestionSource: "HISTORICAL_BACKFILL" },
      { id: observation.newer, vehicleId: fixtureVehicleId, fixFingerprint: fingerprint("newer"), observedAt: at(cutoff, 1), latitude: 0.1, longitude: 0.1, fetchedAt: cutoff, ingestionSource: "HISTORICAL_BACKFILL" },
    ] });

    const fixturePlan = await retention.getRetentionPlan();
    assert.equal(fixturePlan.checkpoints.fullyObsolete, 1);
    assert.equal(fixturePlan.checkpoints.boundaryOverlap, 1);
    assert.equal(fixturePlan.observations.executableObservationCandidates, 2);

    const holder = new Client({ connectionString: process.env.DATABASE_URL });
    await holder.connect();
    try {
      assert.equal((await holder.query("SELECT pg_try_advisory_lock($1) AS acquired", [1706170003])).rows[0].acquired, true);
      const beforeContention = await exactSnapshot();
      assert.deepEqual(await automatic.evaluate(), { outcome: "LOCK_UNAVAILABLE", result: null });
      assert.deepEqual(await exactSnapshot(), beforeContention);
    } finally {
      await holder.query("SELECT pg_advisory_unlock($1)", [1706170003]);
      await holder.end();
    }

    await prisma.positionHistoryPopulationRun.create({ data: { id: fixtureRunId, status: "PENDING", initiatorType: "SYSTEM", to: new Date(businessPlan.canonicalAnchor), excludeProviderDisabled: true, windowBudget: 1 } });
    const beforeActive = await exactSnapshot();
    assert.deepEqual(await automatic.evaluate(), { outcome: "ACTIVE_POPULATION", result: null });
    assert.deepEqual(await exactSnapshot(), beforeActive);
    await prisma.positionHistoryPopulationRun.delete({ where: { id: fixtureRunId } });

    const callsBeforeExecution = automaticCalls;
    const executed = await automatic.evaluate();
    assert.equal(executed.outcome, "EXECUTED");
    assert.equal(automaticCalls, callsBeforeExecution + 1);
    assert.equal(executed.result.deletedCheckpoints, 1);
    assert.equal(executed.result.deletedObservations, 2);
    assert.equal(executed.result.remainingFullyObsoleteCheckpoints, 0);
    assert.equal(executed.result.remainingExecutableObservationCandidates, 0);
    assert.equal(executed.result.stoppedByBudget, false);
    assert.equal(await prisma.vehiclePositionBackfillCheckpoint.count({ where: { id: checkpoint.obsolete } }), 0);
    assert.equal(await prisma.vehiclePositionBackfillCheckpoint.count({ where: { id: { in: [checkpoint.boundary, checkpoint.protected] } } }), 2);
    assert.equal(await prisma.vehiclePositionObservation.count({ where: { id: { in: [observation.obsolete, observation.uncovered] } } }), 0);
    assert.equal(await prisma.vehiclePositionObservation.count({ where: { id: { in: [observation.boundary, observation.exact, observation.newer] } } }), 3);

    report = {
      businessPlan,
      businessNoWork: { outcome: "NO_WORK", deletedCheckpoints: 0, deletedObservations: 0 },
      fixturePlan,
      lockContention: { outcome: "LOCK_UNAVAILABLE", deletedCheckpoints: 0, deletedObservations: 0 },
      activePopulation: { outcome: "ACTIVE_POPULATION", deletedCheckpoints: 0, deletedObservations: 0 },
      execution: executed,
      externalRequests: 0,
    };
  } finally {
    await cleanupFixture();
    const after = await exactSnapshot();
    assert.deepEqual(after, before);
    if (report) process.stdout.write(`${JSON.stringify({ ...report, before, after, preExistingBusinessIdentical: true, fixtureCleaned: true }, null, 2)}\n`);
  }
});

test.after(async () => { await cleanupFixture(); await prisma.$disconnect(); });
