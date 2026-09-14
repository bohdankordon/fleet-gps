const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Client } = require("pg");
const { assertContainerTestDatabaseUrl } = require("./assert-container-test-database-url.cjs");
const { assertTestDatabaseUrl } = require("./assert-test-database-url.cjs");

if (process.env.TEST_DATABASE_RUNNER === "linux") assertContainerTestDatabaseUrl();
else assertTestDatabaseUrl();

const { PositionBackfillStatus, PositionHistoryReplayKind, PositionIngestionSource, PrismaClient } = require("../dist/generated/prisma/client");
const { normalizePositionHistoryCandidate } = require("../dist/modules/position-history");
const { PositionHistoryReplayWorkerService } = require("../dist/modules/position-history-continuous-ingestion/position-history-replay-worker.service");
const { PositionHistoryHorizonAlreadyRunningError, PositionHistoryHorizonExecutionLockService } = require("../dist/modules/position-history-horizon-execution/position-history-horizon-execution-lock.service");
const { PositionHistoryIngestionCursorStaleProgressError } = require("../dist/modules/position-history-ingestion-cursor");
const { PrismaPositionHistoryIngestionCursorRepository } = require("../dist/modules/position-history-ingestion-cursor/prisma-position-history-ingestion-cursor.repository");
const { PrismaPositionHistoryReplayRepository } = require("../dist/modules/position-history-replay-generation/prisma-position-history-replay.repository");
const { PositionHistoryReplayRunStateService } = require("../dist/modules/position-history-replay-generation/position-history-replay-run-state.service");
const { PrismaPositionHistoryRetentionRepository } = require("../dist/modules/position-history-retention/prisma-position-history-retention.repository");
const { PositionHistoryRetentionService } = require("../dist/modules/position-history-retention/position-history-retention.service");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const database = { getClient: () => prisma };
const vehicleIds = [];
const runIds = [];

function lockService() {
  return new PositionHistoryHorizonExecutionLockService(async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    return { query: (text, values) => client.query(text, [...values]), release: () => client.end() };
  });
}

function fingerprint(label) { return crypto.createHash("sha256").update(`pr5:${label}:${vehicleIds[0]}`).digest("hex"); }
function candidate(observedAt, label) {
  const value = normalizePositionHistoryCandidate({ observedAt, latitude: 49.2, longitude: 28.4, speedKph: 10, valid: true, outdated: false, fetchedAt: new Date("2026-09-14T03:00:00Z"), ingestionSource: PositionIngestionSource.HISTORICAL_BACKFILL });
  assert.notEqual(value, null);
  return { ...value, fixFingerprint: fingerprint(label) };
}

async function cleanup() {
  if (runIds.length > 0) await prisma.positionHistoryReplayRun.deleteMany({ where: { id: { in: runIds } } });
  if (vehicleIds.length > 0) {
    await prisma.positionHistoryReplayCheckpoint.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
    await prisma.vehiclePositionObservation.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
    await prisma.vehiclePositionBackfillCheckpoint.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
    await prisma.vehicleHistoryIngestionCursor.deleteMany({ where: { vehicleId: { in: vehicleIds } } });
    await prisma.vehicle.deleteMany({ where: { id: { in: vehicleIds } } });
  }
}

test("real PostgreSQL integrates cursor/replay policy floors before finite retention deletion", async () => {
  await cleanup();
  const now = new Date("2026-09-14T03:00:00Z");
  const cutoff = new Date("2026-06-10T02:00:00Z");
  const [vehicleA, vehicleB, vehicleC] = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
  vehicleIds.push(vehicleA, vehicleB, vehicleC);
  for (const [index, id] of vehicleIds.entries()) await prisma.vehicle.create({ data: { id, externalDeviceId: 1_700_000_000 + index + Math.floor(Math.random() * 1_000_000), name: `pr5-retention-${index}`, disabled: index === 2 } });

  await prisma.vehicleHistoryIngestionCursor.createMany({ data: [
    { vehicleId: vehicleA, coverageFrom: new Date("2026-06-01T02:00:00Z"), confirmedThrough: new Date("2026-06-05T02:00:00Z") },
    { vehicleId: vehicleB, coverageFrom: new Date("2026-06-01T02:00:00Z"), confirmedThrough: new Date("2026-06-15T02:00:00Z") },
    { vehicleId: vehicleC, coverageFrom: new Date("2026-06-12T02:00:00Z"), confirmedThrough: new Date("2026-06-20T02:00:00Z") },
  ] });

  const runId = crypto.randomUUID();
  runIds.push(runId);
  await prisma.positionHistoryReplayRun.create({ data: { id: runId, kind: PositionHistoryReplayKind.ROLLING_90_DAY, generationAnchor: new Date("2026-01-01T02:00:00Z"), rangeFrom: new Date("2026-05-01T02:00:00Z"), rangeTo: new Date("2026-06-20T02:00:00Z") } });
  const partialId = crypto.randomUUID();
  const expiredId = crypto.randomUUID();
  await prisma.positionHistoryReplayCheckpoint.createMany({ data: [
    { id: partialId, runId, vehicleId: vehicleA, rangeFrom: new Date("2026-06-01T02:00:00Z"), rangeTo: new Date("2026-06-20T02:00:00Z"), nextFrom: new Date("2026-06-05T02:00:00Z"), status: PositionBackfillStatus.RUNNING },
    { id: expiredId, runId, vehicleId: vehicleB, rangeFrom: new Date("2026-05-01T02:00:00Z"), rangeTo: new Date("2026-06-01T02:00:00Z"), nextFrom: new Date("2026-05-05T02:00:00Z"), status: PositionBackfillStatus.PENDING },
  ] });

  const obsoleteFinite = crypto.randomUUID();
  const survivingFinite = crypto.randomUUID();
  await prisma.vehiclePositionBackfillCheckpoint.createMany({ data: [
    { id: obsoleteFinite, vehicleId: vehicleA, rangeFrom: new Date("2026-04-01T02:00:00Z"), rangeTo: new Date("2026-04-02T02:00:00Z"), nextFrom: new Date("2026-04-02T02:00:00Z"), status: PositionBackfillStatus.COMPLETED },
    { id: survivingFinite, vehicleId: vehicleA, rangeFrom: new Date("2026-06-01T02:00:00Z"), rangeTo: cutoff, nextFrom: cutoff, status: PositionBackfillStatus.COMPLETED },
  ] });
  const expiredUncovered = candidate(new Date("2026-04-15T02:00:00Z"), "expired-uncovered");
  const expiredProtected = candidate(new Date("2026-06-05T02:00:00Z"), "expired-protected");
  const atCutoff = candidate(cutoff, "at-cutoff");
  await prisma.vehiclePositionObservation.createMany({ data: [expiredUncovered, expiredProtected, atCutoff].map((value) => ({ vehicleId: vehicleA, ...value })) });

  const retentionRepository = new PrismaPositionHistoryRetentionRepository(database);
  const retention = new PositionHistoryRetentionService(retentionRepository, { now: () => now }, lockService(), { appendWithDatabase: async () => ({ id: "unused" }) });
  const plan = await retention.getRetentionPlan();
  assert.deepEqual(plan.policyReconciliation, { cursorFloorCandidates: 2, replayCheckpointCandidates: 2 });
  const result = await retention.executeRetention({ expectedCanonicalAnchor: new Date(plan.canonicalAnchor), expectedPolicyCutoff: new Date(plan.policyCutoff) });
  assert.deepEqual({ cursorFloors: result.advancedCursorFloors, replay: result.advancedReplayCheckpoints, replayCompleted: result.completedReplayCheckpoints }, { cursorFloors: 2, replay: 2, replayCompleted: 1 });

  const [cursorA, cursorB, cursorC] = await Promise.all(vehicleIds.map((id) => prisma.vehicleHistoryIngestionCursor.findUnique({ where: { vehicleId: id } })));
  assert.deepEqual([cursorA.coverageFrom.toISOString(), cursorA.confirmedThrough.toISOString()], [cutoff.toISOString(), cutoff.toISOString()]);
  assert.deepEqual([cursorB.coverageFrom.toISOString(), cursorB.confirmedThrough.toISOString()], [cutoff.toISOString(), "2026-06-15T02:00:00.000Z"]);
  assert.deepEqual([cursorC.coverageFrom.toISOString(), cursorC.confirmedThrough.toISOString()], ["2026-06-12T02:00:00.000Z", "2026-06-20T02:00:00.000Z"]);

  const partial = await prisma.positionHistoryReplayCheckpoint.findUnique({ where: { id: partialId } });
  const expired = await prisma.positionHistoryReplayCheckpoint.findUnique({ where: { id: expiredId } });
  assert.deepEqual([partial.nextFrom.toISOString(), partial.status], [cutoff.toISOString(), PositionBackfillStatus.RUNNING]);
  assert.deepEqual([expired.nextFrom.toISOString(), expired.status], ["2026-06-01T02:00:00.000Z", PositionBackfillStatus.COMPLETED]);
  assert.equal(await prisma.vehiclePositionBackfillCheckpoint.count({ where: { id: obsoleteFinite } }), 0);
  assert.equal(await prisma.vehiclePositionBackfillCheckpoint.count({ where: { id: survivingFinite } }), 1);
  assert.equal(await prisma.vehiclePositionObservation.count({ where: { vehicleId: vehicleA, fixFingerprint: expiredUncovered.fixFingerprint } }), 0);
  assert.equal(await prisma.vehiclePositionObservation.count({ where: { vehicleId: vehicleA, fixFingerprint: { in: [expiredProtected.fixFingerprint, atCutoff.fixFingerprint] } } }), 2);

  const staleCandidate = candidate(new Date("2026-06-12T02:00:00Z"), "stale-plan");
  const cursorRepository = new PrismaPositionHistoryIngestionCursorRepository(database);
  await assert.rejects(cursorRepository.persistContiguousResult({ vehicleId: vehicleB, expectedCoverageFrom: new Date("2026-06-01T02:00:00Z"), expectedConfirmedThrough: new Date("2026-06-15T02:00:00Z"), nextConfirmedThrough: new Date("2026-06-16T02:00:00Z"), candidates: [staleCandidate] }), PositionHistoryIngestionCursorStaleProgressError);
  assert.equal(await prisma.vehiclePositionObservation.count({ where: { vehicleId: vehicleB, fixFingerprint: staleCandidate.fixFingerprint } }), 0);

  await prisma.positionHistoryReplayCheckpoint.update({ where: { id: partialId }, data: { nextFrom: new Date("2026-06-20T02:00:00Z"), status: PositionBackfillStatus.COMPLETED } });
  let providerCalls = 0;
  const replayRepository = new PrismaPositionHistoryReplayRepository(database);
  const replayWorker = new PositionHistoryReplayWorkerService(
    replayRepository,
    new PositionHistoryReplayRunStateService(database),
    { read: async () => { providerCalls += 1; throw new Error("expired replay must not call provider"); } },
    lockService(),
    { now: () => now },
    { sleep: async () => undefined },
    { start: () => () => undefined },
  );
  const replayResult = await replayWorker.processKind(PositionHistoryReplayKind.ROLLING_90_DAY);
  assert.equal(replayResult.outcome, "COMPLETED_RUN");
  assert.equal(providerCalls, 0);
  assert.equal(await prisma.vehiclePositionObservation.count({ where: { vehicleId: vehicleA, fixFingerprint: expiredUncovered.fixFingerprint } }), 0);
  const automaticallyEnsuredRun = await prisma.positionHistoryReplayRun.findUnique({ where: { kind_generationAnchor: { kind: PositionHistoryReplayKind.ROLLING_90_DAY, generationAnchor: new Date("2026-09-08T02:00:00Z") } } });
  if (automaticallyEnsuredRun !== null) runIds.push(automaticallyEnsuredRun.id);

  const restarted = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    assert.equal((await restarted.vehicleHistoryIngestionCursor.findUnique({ where: { vehicleId: vehicleA } })).coverageFrom.toISOString(), cutoff.toISOString());
    assert.equal((await restarted.positionHistoryReplayCheckpoint.findUnique({ where: { id: expiredId } })).status, PositionBackfillStatus.COMPLETED);
  } finally { await restarted.$disconnect(); }
});

test("independent PostgreSQL sessions exclude every history workload while retention owns coordination", async () => {
  const retention = lockService();
  let entered;
  const acquired = new Promise((resolve) => { entered = resolve; });
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  const owner = retention.runExclusive(async () => { entered(); await held; });
  await acquired;
  for (const workload of ["continuous", "replay", "population", "retention"]) {
    let work = 0;
    await assert.rejects(lockService().runExclusive(async () => { work += 1; }), PositionHistoryHorizonAlreadyRunningError, workload);
    assert.equal(work, 0);
  }
  release();
  await owner;
  assert.equal(await lockService().runExclusive(async () => "released"), "released");
});

test.after(async () => { try { await cleanup(); } finally { try { await prisma.$disconnect(); } catch {} } });
