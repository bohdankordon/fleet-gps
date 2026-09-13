const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Client } = require("pg");
const { assertContainerTestDatabaseUrl } = require("./assert-container-test-database-url.cjs");
const { assertTestDatabaseUrl } = require("./assert-test-database-url.cjs");
const { PositionHistoryAutomaticRequestPacer, POSITION_HISTORY_AUTOMATIC_REQUEST_START_GAP_MS } = require("../dist/modules/position-history-horizon-execution");
const { PositionHistoryHorizonAlreadyRunningError, PositionHistoryHorizonExecutionLockService } = require("../dist/modules/position-history-horizon-execution/position-history-horizon-execution-lock.service");
const { PositionBackfillStatus, PositionHistoryPopulationRunInitiatorType, PositionHistoryPopulationRunStatus, PositionIngestionSource, PrismaClient } = require("../dist/generated/prisma/client");
const { normalizePositionHistoryCandidate } = require("../dist/modules/position-history");
const { PositionHistoryBackfillDurableAccountingError } = require("../dist/modules/position-history-backfill/position-history-backfill.errors");
const { PrismaPositionHistoryBackfillRepository } = require("../dist/modules/position-history-backfill/prisma-position-history-backfill.repository");

if (process.env.TEST_DATABASE_RUNNER === "linux") assertContainerTestDatabaseUrl();
else assertTestDatabaseUrl();

function lockService() {
  return new PositionHistoryHorizonExecutionLockService(async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    return { query: (text, values) => client.query(text, [...values]), release: () => client.end() };
  });
}

test("independent sessions exclude replay while population owns the shared history lock, then hand it off", async () => {
  const population = lockService();
  const replay = lockService();
  let enter;
  const entered = new Promise((resolve) => { enter = resolve; });
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  const populationQuantum = population.runExclusive(async () => { enter(); await held; return "population-yielded"; });
  await entered;
  let providerCalls = 0;
  await assert.rejects(replay.runExclusive(async () => { providerCalls += 1; }), PositionHistoryHorizonAlreadyRunningError);
  assert.equal(providerCalls, 0);
  release();
  assert.equal(await populationQuantum, "population-yielded");
  assert.equal(await replay.runExclusive(async () => { providerCalls += 1; return "replay-owned"; }), "replay-owned");
  assert.equal(providerCalls, 1);
});

test("cooling before advisory-lock release carries the two-second start fence across replicas", async () => {
  const firstReplica = lockService();
  const secondReplica = lockService();
  const starts = [];
  const clock = { now: () => new Date() };
  const sleeper = { sleep: (durationMs) => new Promise((resolve) => setTimeout(resolve, durationMs)) };
  await firstReplica.runExclusive(async () => {
    const pacer = new PositionHistoryAutomaticRequestPacer(clock, sleeper, POSITION_HISTORY_AUTOMATIC_REQUEST_START_GAP_MS);
    await pacer.beforeRequestStart();
    starts.push(Date.now());
    await pacer.coolBeforeLockRelease();
  });
  await secondReplica.runExclusive(async () => {
    const pacer = new PositionHistoryAutomaticRequestPacer(clock, sleeper, POSITION_HISTORY_AUTOMATIC_REQUEST_START_GAP_MS);
    await pacer.beforeRequestStart();
    starts.push(Date.now());
  });
  assert.equal(starts.length, 2);
  assert.ok(starts[1] - starts[0] >= POSITION_HISTORY_AUTOMATIC_REQUEST_START_GAP_MS - 25, `observed ${starts[1] - starts[0]}ms start gap`);
});

test("expired durable-population ownership cannot commit observation, checkpoint, or accounting", async () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  const repository = new PrismaPositionHistoryBackfillRepository({ getClient: () => prisma });
  const vehicleId = crypto.randomUUID();
  const runId = crypto.randomUUID();
  const owner = crypto.randomUUID();
  const from = new Date("2026-09-01T00:00:00Z");
  const to = new Date("2026-09-01T01:00:00Z");
  try {
    await prisma.vehicle.create({ data: { id: vehicleId, externalDeviceId: 1_800_000_000 + Math.floor(Math.random() * 100_000_000), name: "coordination-test", disabled: false } });
    const checkpoint = await prisma.vehiclePositionBackfillCheckpoint.create({ data: { vehicleId, rangeFrom: from, rangeTo: to, nextFrom: from, status: PositionBackfillStatus.PENDING } });
    await prisma.positionHistoryPopulationRun.create({ data: { id: runId, initiatorType: PositionHistoryPopulationRunInitiatorType.SYSTEM, to, excludeProviderDisabled: false, windowBudget: 1, status: PositionHistoryPopulationRunStatus.RUNNING, startedAt: new Date(Date.now() - 120_000), leaseOwner: owner, leaseExpiresAt: new Date(Date.now() - 1_000) } });
    const candidate = normalizePositionHistoryCandidate({ observedAt: new Date("2026-09-01T00:30:00Z"), latitude: 49.2, longitude: 28.4, speedKph: 10, valid: true, outdated: false, fetchedAt: new Date(), ingestionSource: PositionIngestionSource.HISTORICAL_BACKFILL });
    assert.notEqual(candidate, null);
    await assert.rejects(repository.persistWindow({ checkpointId: checkpoint.id, vehicleId, expectedNextFrom: from, nextFrom: to, completed: true, candidates: [candidate], durableAccounting: { runId, leaseOwner: owner } }), PositionHistoryBackfillDurableAccountingError);
    assert.equal(await prisma.vehiclePositionObservation.count({ where: { vehicleId } }), 0);
    assert.equal((await prisma.vehiclePositionBackfillCheckpoint.findUnique({ where: { id: checkpoint.id } })).nextFrom.toISOString(), from.toISOString());
    assert.equal((await prisma.positionHistoryPopulationRun.findUnique({ where: { id: runId } })).committedWindows, 0);
  } finally {
    await prisma.vehiclePositionObservation.deleteMany({ where: { vehicleId } });
    await prisma.vehiclePositionBackfillCheckpoint.deleteMany({ where: { vehicleId } });
    await prisma.positionHistoryPopulationRun.deleteMany({ where: { id: runId } });
    await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
    await prisma.$disconnect();
  }
});
