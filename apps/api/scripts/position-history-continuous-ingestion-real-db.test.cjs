const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Client } = require("pg");
const { assertContainerTestDatabaseUrl } = require("./assert-container-test-database-url.cjs");
const { assertTestDatabaseUrl } = require("./assert-test-database-url.cjs");
const { PositionIngestionSource, PrismaClient } = require("../dist/generated/prisma/client");
const { normalizePositionHistoryCandidate } = require("../dist/modules/position-history");
const { PrismaPositionHistoryContinuousIngestionRepository } = require("../dist/modules/position-history-continuous-ingestion/prisma-position-history-continuous-ingestion.repository");
const { PositionHistoryContinuousIngestionWorkerService } = require("../dist/modules/position-history-continuous-ingestion/position-history-continuous-ingestion-worker.service");
const { PositionHistoryHistoricalWindowOversizedError } = require("../dist/modules/position-history-historical-window");
const { PositionHistoryIngestionCursorStaleProgressError } = require("../dist/modules/position-history-ingestion-cursor");
const { PositionHistoryIngestionCursorService } = require("../dist/modules/position-history-ingestion-cursor/position-history-ingestion-cursor.service");
const { PrismaPositionHistoryIngestionCursorRepository } = require("../dist/modules/position-history-ingestion-cursor/prisma-position-history-ingestion-cursor.repository");
const { PositionHistoryHorizonAlreadyRunningError, PositionHistoryHorizonExecutionLockService } = require("../dist/modules/position-history-horizon-execution/position-history-horizon-execution-lock.service");

if (process.env.TEST_DATABASE_RUNNER === "linux") assertContainerTestDatabaseUrl();
else assertTestDatabaseUrl();

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const cursorService = new PositionHistoryIngestionCursorService(new PrismaPositionHistoryIngestionCursorRepository({ getClient: () => prisma }));
const continuousRepository = new PrismaPositionHistoryContinuousIngestionRepository({ getClient: () => prisma });
const vehicleIds = new Set();

function lockService() {
  return new PositionHistoryHorizonExecutionLockService(async () => {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    return { query: (text, values) => client.query(text, [...values]), release: async () => client.end() };
  });
}

function candidate(at, latitude, source = PositionIngestionSource.HISTORICAL_BACKFILL) {
  const result = normalizePositionHistoryCandidate({ observedAt: new Date(at), latitude, longitude: 28.4, speedKph: 10, valid: true, outdated: false, fetchedAt: new Date("2026-09-13T12:00:00Z"), ingestionSource: source });
  assert.notEqual(result, null);
  return result;
}

async function cleanup() {
  const ids = [...vehicleIds];
  if (ids.length === 0) return;
  await prisma.vehicleHistoryIngestionCursor.deleteMany({ where: { vehicleId: { in: ids } } });
  await prisma.vehiclePositionObservation.deleteMany({ where: { vehicleId: { in: ids } } });
  await prisma.vehicle.deleteMany({ where: { id: { in: ids } } });
}

test("two independent continuous owners are excluded by the shared PostgreSQL history lock", async () => {
  const first = lockService();
  const second = lockService();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let entered = 0;
  const owner = first.runExclusive(async () => { entered += 1; await gate; });
  while (entered === 0) await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(second.runExclusive(async () => { entered += 1; }), PositionHistoryHorizonAlreadyRunningError);
  assert.equal(entered, 1);
  release();
  await owner;
  assert.equal(await second.runExclusive(async () => "acquired-after-yield"), "acquired-after-yield");
});

test("real continuous persistence is atomic, restart-safe, CAS-fenced, and duplicate-idempotent", async () => {
  const vehicleId = crypto.randomUUID();
  vehicleIds.add(vehicleId);
  await prisma.vehicle.create({ data: { id: vehicleId, externalDeviceId: 1800000000 + Math.floor(Math.random() * 100000000), name: "continuous-real-db-fixture", disabled: false } });
  const now = new Date("2026-09-13T12:00:00Z");
  const initialized = await cursorService.ensureCursor(vehicleId, now);
  assert.equal(initialized.coverageFrom.toISOString(), initialized.confirmedThrough.toISOString());
  const t0 = initialized.confirmedThrough;
  const t1 = new Date(t0.getTime() + (5 * 60 + 45) * 60 * 1_000);
  const t2 = new Date(t1.getTime() + (5 * 60 + 45) * 60 * 1_000);
  const values = [
    candidate(new Date(t0.getTime() + 1 * 60 * 1_000).toISOString(), 49.1, PositionIngestionSource.FLEET_SYNC),
    candidate(new Date(t0.getTime() + 2 * 60 * 1_000).toISOString(), 49.2),
    candidate(new Date(t0.getTime() + 3 * 60 * 1_000).toISOString(), 49.3),
    candidate(new Date(t0.getTime() + 4 * 60 * 1_000).toISOString(), 49.4, PositionIngestionSource.FLEET_SYNC),
  ];
  await prisma.vehiclePositionObservation.createMany({ data: [{ vehicleId, ...values[0] }, { vehicleId, ...values[3] }] });
  const historical = values.map((value) => ({ ...value, ingestionSource: PositionIngestionSource.HISTORICAL_BACKFILL }));

  const committed = await lockService().runExclusive(() => cursorService.persistContiguousResult({ vehicleId, expectedCoverageFrom: t0, expectedConfirmedThrough: t0, nextConfirmedThrough: t1, candidates: historical }));
  assert.deepEqual(committed, { inserted: 2, duplicates: 2 });
  assert.equal(await prisma.vehiclePositionObservation.count({ where: { vehicleId } }), 4);
  assert.equal((await cursorService.findCursor(vehicleId)).confirmedThrough.toISOString(), t1.toISOString());

  const stale = candidate(new Date(t1.getTime() + 1_000).toISOString(), 49.5);
  await assert.rejects(cursorService.persistContiguousResult({ vehicleId, expectedCoverageFrom: t0, expectedConfirmedThrough: t0, nextConfirmedThrough: t2, candidates: [stale] }), PositionHistoryIngestionCursorStaleProgressError);
  assert.equal(await prisma.vehiclePositionObservation.count({ where: { vehicleId, fixFingerprint: stale.fixFingerprint } }), 0);
  assert.equal((await cursorService.findCursor(vehicleId)).confirmedThrough.toISOString(), t1.toISOString());

  const restartedCursorService = new PositionHistoryIngestionCursorService(new PrismaPositionHistoryIngestionCursorRepository({ getClient: () => prisma }));
  assert.equal((await restartedCursorService.findCursor(vehicleId)).confirmedThrough.toISOString(), t1.toISOString());
  await restartedCursorService.persistContiguousResult({ vehicleId, expectedCoverageFrom: t0, expectedConfirmedThrough: t1, nextConfirmedThrough: t2, candidates: [] });
  assert.equal((await restartedCursorService.findCursor(vehicleId)).confirmedThrough.toISOString(), t2.toISOString());

  assert.deepEqual(await continuousRepository.persistReplay(vehicleId, historical), { inserted: 0, duplicates: 4 });
  assert.equal(await prisma.vehiclePositionObservation.count({ where: { vehicleId } }), 4);
});

test("typed oversized fallback advances only the successful smaller interval in real PostgreSQL", async () => {
  const vehicleId = crypto.randomUUID();
  vehicleIds.add(vehicleId);
  await prisma.vehicle.create({ data: { id: vehicleId, externalDeviceId: 1900000000 + Math.floor(Math.random() * 10000000), name: "capacity-fallback-real-db-fixture", disabled: false } });
  const now = new Date("2026-09-13T12:00:00Z");
  const initialized = await cursorService.ensureCursor(vehicleId, now);
  const confirmedThrough = new Date(initialized.confirmedThrough.getTime() + 60 * 60 * 1_000);
  await prisma.vehicleHistoryIngestionCursor.update({ where: { vehicleId }, data: { confirmedThrough } });
  const starts = [];
  let clockMs = now.getTime();
  const worker = new PositionHistoryContinuousIngestionWorkerService(
    { listMappedVehicles: async () => [{ vehicleId, externalDeviceId: 1, disabled: false }], persistReplay: async () => ({ inserted: 0, duplicates: 0 }) },
    cursorService,
    { read: async (request, options = {}) => {
      await options.beforeRequestStart?.();
      starts.push([request.from.getTime(), request.to.getTime()]);
      if (request.to.getTime() - request.from.getTime() > 60 * 60 * 1_000) throw new PositionHistoryHistoricalWindowOversizedError();
      return { fetchFrom: request.from, fetchTo: request.to, fetchedAt: new Date(clockMs), providerRows: 0, candidates: [], skippedInvalid: 0, requests: 1, retries: 0, rateLimitResponses: 0 };
    } },
    lockService(),
    { now: () => new Date(clockMs) },
    { sleep: async (durationMs) => { clockMs += durationMs; } },
  );
  const result = await worker.processCycle(1, ["CONTIGUOUS_BACKLOG"]);
  assert.equal(result.backlogCompleted, 1);
  assert.deepEqual(starts.map(([from, to]) => (to - from) / 3_600_000), [6, 3, 1]);
  assert.equal((await cursorService.findCursor(vehicleId)).confirmedThrough.getTime(), confirmedThrough.getTime() + 45 * 60 * 1_000);
});

test.after(async () => { await cleanup(); await prisma.$disconnect(); });
