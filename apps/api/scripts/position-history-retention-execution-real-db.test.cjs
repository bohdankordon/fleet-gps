const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("../dist/generated/prisma/client");
const { PositionHistoryHorizonExecutionLockService } = require("../dist/modules/position-history-horizon-execution/position-history-horizon-execution-lock.service");
const { PrismaPositionHistoryRetentionRepository } = require("../dist/modules/position-history-retention/prisma-position-history-retention.repository");
const { PositionHistoryRetentionService } = require("../dist/modules/position-history-retention/position-history-retention.service");
const { PositionHistoryRetentionExecutionError } = require("../dist/modules/position-history-retention/position-history-retention.types");
const { Client } = require("pg");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const database = { getClient: () => prisma };
const fixtureVehicleId = crypto.randomUUID();
const fixturePrefix = `stage-19b-retention-${fixtureVehicleId}`;
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
  await prisma.vehiclePositionObservation.deleteMany({ where: { vehicleId: fixtureVehicleId } });
  await prisma.vehiclePositionBackfillCheckpoint.deleteMany({ where: { vehicleId: fixtureVehicleId } });
  await prisma.vehicle.deleteMany({ where: { id: fixtureVehicleId, name: fixturePrefix } });
}

function fingerprint(label) { return crypto.createHash("sha256").update(`${fixturePrefix}:${label}`).digest("hex"); }
function at(base, hours) { return new Date(base.getTime() + hours * 60 * 60 * 1000); }
function lockService() {
  return new PositionHistoryHorizonExecutionLockService(async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    return { query: (text, values) => client.query(text, [...values]), release: () => client.end() };
  });
}

test("Stage 19B real PostgreSQL disposable fixture proves checkpoint-first deletion and retained inclusive coverage", async () => {
  await cleanupFixture();
  const before = await exactSnapshot();
  const events = [];
  let report;
  try {
    assert.equal((await prisma.$queryRaw`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`).length, 11);
    assert.equal(await prisma.positionHistoryPopulationRun.count({ where: { status: { in: ["PENDING", "RUNNING"] } } }), 0);

    const realRepository = new PrismaPositionHistoryRetentionRepository(database);
    const planner = new PositionHistoryRetentionService(realRepository, { now: () => new Date() }, lockService());
    const businessPlan = await planner.getRetentionPlan();
    assert.equal(businessPlan.checkpoints.fullyObsolete, 0, "pre-existing business checkpoint candidates prohibit destructive validation");
    assert.equal(businessPlan.observations.executableObservationCandidates, 0, "pre-existing business observation candidates prohibit destructive validation");
    const cutoff = new Date(businessPlan.policyCutoff);

    let externalDeviceId = 2_000_000_000 + Math.floor(Math.random() * 100_000_000);
    while (await prisma.vehicle.count({ where: { externalDeviceId } })) externalDeviceId += 1;
    await prisma.vehicle.create({ data: { id: fixtureVehicleId, externalDeviceId, name: fixturePrefix, disabled: true } });
    const obsoleteCheckpoint = crypto.randomUUID();
    const boundaryCheckpoint = crypto.randomUUID();
    const protectedCheckpoint = crypto.randomUUID();
    await prisma.vehiclePositionBackfillCheckpoint.createMany({ data: [
      { id: obsoleteCheckpoint, vehicleId: fixtureVehicleId, rangeFrom: at(cutoff, -72), rangeTo: at(cutoff, -48), nextFrom: at(cutoff, -48), status: "COMPLETED" },
      { id: boundaryCheckpoint, vehicleId: fixtureVehicleId, rangeFrom: at(cutoff, -24), rangeTo: cutoff, nextFrom: at(cutoff, -12), status: "RUNNING" },
      { id: protectedCheckpoint, vehicleId: fixtureVehicleId, rangeFrom: cutoff, rangeTo: at(cutoff, 24), nextFrom: cutoff, status: "PENDING" },
    ] });
    const observations = {
      obsolete: crypto.randomUUID(), boundary: crypto.randomUUID(), uncovered: crypto.randomUUID(), exact: crypto.randomUUID(), newer: crypto.randomUUID(),
    };
    await prisma.vehiclePositionObservation.createMany({ data: [
      { id: observations.obsolete, vehicleId: fixtureVehicleId, fixFingerprint: fingerprint("obsolete"), observedAt: at(cutoff, -60), latitude: 0.1, longitude: 0.1, fetchedAt: cutoff, ingestionSource: "HISTORICAL_BACKFILL" },
      { id: observations.boundary, vehicleId: fixtureVehicleId, fixFingerprint: fingerprint("boundary"), observedAt: at(cutoff, -12), latitude: 0.1, longitude: 0.1, fetchedAt: cutoff, ingestionSource: "HISTORICAL_BACKFILL" },
      { id: observations.uncovered, vehicleId: fixtureVehicleId, fixFingerprint: fingerprint("uncovered"), observedAt: at(cutoff, -36), latitude: 0.1, longitude: 0.1, fetchedAt: cutoff, ingestionSource: "HISTORICAL_BACKFILL" },
      { id: observations.exact, vehicleId: fixtureVehicleId, fixFingerprint: fingerprint("exact"), observedAt: cutoff, latitude: 0.1, longitude: 0.1, fetchedAt: cutoff, ingestionSource: "HISTORICAL_BACKFILL" },
      { id: observations.newer, vehicleId: fixtureVehicleId, fixFingerprint: fingerprint("newer"), observedAt: at(cutoff, 1), latitude: 0.1, longitude: 0.1, fetchedAt: cutoff, ingestionSource: "HISTORICAL_BACKFILL" },
    ] });

    const fixturePlan = await planner.getRetentionPlan();
    assert.equal(fixturePlan.checkpoints.fullyObsolete, 1);
    assert.equal(fixturePlan.checkpoints.boundaryOverlap, 1);
    assert.equal(fixturePlan.checkpoints.protected, businessPlan.checkpoints.protected + 1);
    assert.equal(fixturePlan.observations.executableObservationCandidates, 2);

    const instrumented = {
      inspect: (value) => realRepository.inspect(value),
      countActiveDurableRuns: () => realRepository.countActiveDurableRuns(),
      reconcilePolicyFloor: async (value) => { events.push("policy-reconciliation-start"); const reconciled = await realRepository.reconcilePolicyFloor(value); events.push("policy-reconciliation-committed"); return reconciled; },
      deleteFullyObsoleteCheckpointBatch: async (value, limit) => { events.push("checkpoint-delete-start"); const count = await realRepository.deleteFullyObsoleteCheckpointBatch(value, limit); events.push("checkpoint-delete-committed"); return count; },
      countFullyObsoleteCheckpoints: async (value) => { events.push("checkpoint-recount"); return realRepository.countFullyObsoleteCheckpoints(value); },
      deleteExecutableObservationBatch: async (value, limit) => { events.push("observation-delete-start"); assert.ok(events.includes("checkpoint-delete-committed")); assert.ok(events.includes("checkpoint-recount")); const count = await realRepository.deleteExecutableObservationBatch(value, limit); events.push("observation-delete-committed"); return count; },
      countExecutableObservationCandidates: (value) => realRepository.countExecutableObservationCandidates(value),
    };
    const execution = new PositionHistoryRetentionService(instrumented, { now: () => new Date() }, lockService());
    const result = await execution.executeRetention({ expectedCanonicalAnchor: new Date(fixturePlan.canonicalAnchor), expectedPolicyCutoff: new Date(fixturePlan.policyCutoff) });
    assert.equal(result.deletedCheckpoints, 1);
    assert.equal(result.deletedObservations, 2);
    assert.equal(result.stoppedByBudget, false);
    assert.equal(await prisma.vehiclePositionBackfillCheckpoint.count({ where: { id: obsoleteCheckpoint } }), 0);
    assert.equal(await prisma.vehiclePositionBackfillCheckpoint.count({ where: { id: { in: [boundaryCheckpoint, protectedCheckpoint] } } }), 2);
    assert.equal(await prisma.vehiclePositionObservation.count({ where: { id: { in: [observations.obsolete, observations.uncovered] } } }), 0);
    assert.equal(await prisma.vehiclePositionObservation.count({ where: { id: { in: [observations.boundary, observations.exact, observations.newer] } } }), 3);

    const fixtureStateBeforeConflicts = await exactSnapshot();
    const holder = new Client({ connectionString: process.env.DATABASE_URL });
    await holder.connect();
    try {
      assert.equal((await holder.query("SELECT pg_try_advisory_lock($1) AS acquired", [1706170003])).rows[0].acquired, true);
      await assert.rejects(execution.executeRetention({ expectedCanonicalAnchor: new Date(fixturePlan.canonicalAnchor), expectedPolicyCutoff: new Date(fixturePlan.policyCutoff) }), (error) => error instanceof PositionHistoryRetentionExecutionError && error.code === "LOCK_UNAVAILABLE");
      assert.deepEqual(await exactSnapshot(), fixtureStateBeforeConflicts);
    } finally {
      await holder.query("SELECT pg_advisory_unlock($1)", [1706170003]);
      await holder.end();
    }

    await assert.rejects(execution.executeRetention({ expectedCanonicalAnchor: at(new Date(fixturePlan.canonicalAnchor), -168), expectedPolicyCutoff: new Date(fixturePlan.policyCutoff) }), (error) => error instanceof PositionHistoryRetentionExecutionError && error.code === "STALE_PLAN");
    assert.deepEqual(await exactSnapshot(), fixtureStateBeforeConflicts);
    report = { businessPlan, fixturePlan, result, events, lockConflict: "LOCK_UNAVAILABLE", staleConflict: "STALE_PLAN" };
  } finally {
    await cleanupFixture();
    const after = await exactSnapshot();
    assert.deepEqual(after, before);
    if (report) process.stdout.write(`${JSON.stringify({ ...report, before, after, preExistingBusinessIdentical: true, externalRequests: 0 }, null, 2)}\n`);
  }
});

test("current pre-existing business truth permits one real locked no-work execution only when candidates remain zero", async () => {
  await cleanupFixture();
  const before = await exactSnapshot();
  const repository = new PrismaPositionHistoryRetentionRepository(database);
  const service = new PositionHistoryRetentionService(repository, { now: () => new Date() }, lockService());
  const plan = await service.getRetentionPlan();
  assert.equal(plan.checkpoints.fullyObsolete, 0);
  assert.equal(plan.observations.executableObservationCandidates, 0);
  const result = await service.executeRetention({ expectedCanonicalAnchor: new Date(plan.canonicalAnchor), expectedPolicyCutoff: new Date(plan.policyCutoff) });
  assert.equal(result.noWork, true);
  assert.equal(result.deletedCheckpoints, 0);
  assert.equal(result.deletedObservations, 0);
  assert.deepEqual(await exactSnapshot(), before);
  process.stdout.write(`${JSON.stringify({ businessNoWorkPlan: plan, businessNoWorkResult: result }, null, 2)}\n`);
});

test.after(async () => { await cleanupFixture(); await prisma.$disconnect(); });
