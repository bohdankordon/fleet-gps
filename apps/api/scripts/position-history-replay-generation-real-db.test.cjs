const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Client } = require("pg");
const { assertContainerTestDatabaseUrl } = require("./assert-container-test-database-url.cjs");
const { assertTestDatabaseUrl } = require("./assert-test-database-url.cjs");
const { PositionBackfillStatus, PositionHistoryReplayKind, PositionIngestionSource, PrismaClient } = require("../dist/generated/prisma/client");
const { normalizePositionHistoryCandidate } = require("../dist/modules/position-history");
const { PositionHistoryReplayCheckpointStaleProgressError, PositionHistoryReplayGenerationConflictError } = require("../dist/modules/position-history-replay-generation");
const { PositionHistoryReplayRunStateService } = require("../dist/modules/position-history-replay-generation/position-history-replay-run-state.service");
const { PrismaPositionHistoryReplayRepository } = require("../dist/modules/position-history-replay-generation/prisma-position-history-replay.repository");

if (process.env.TEST_DATABASE_RUNNER === "linux") assertContainerTestDatabaseUrl();
else assertTestDatabaseUrl();

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const repository = new PrismaPositionHistoryReplayRepository({ getClient: () => prisma });
const state = new PositionHistoryReplayRunStateService({ getClient: () => prisma });
const vehicleIds = new Set();
const runIds = new Set();

async function applyMigrationSql(client, sql) {
  const executable = sql.replace(/--.*$/gm, "");
  for (const statement of executable.split(";").map((value) => value.trim()).filter(Boolean)) await client.query(statement);
}

function candidate(at, latitude, fingerprint) {
  const value = normalizePositionHistoryCandidate({
    observedAt: new Date(at), latitude, longitude: 28.4, speedKph: 10, valid: true, outdated: false,
    fetchedAt: new Date("2026-09-13T12:00:00Z"), ingestionSource: PositionIngestionSource.HISTORICAL_BACKFILL,
  });
  assert.notEqual(value, null);
  return fingerprint === undefined ? value : { ...value, fixFingerprint: fingerprint };
}

async function createVehicle(label) {
  const id = crypto.randomUUID();
  vehicleIds.add(id);
  await prisma.vehicle.create({ data: { id, externalDeviceId: 1_500_000_000 + Math.floor(Math.random() * 400_000_000), name: `replay-${label}`, disabled: false } });
  return id;
}

async function ensureRun(input) {
  const run = await repository.ensureRun(input);
  runIds.add(run.id);
  return run;
}

async function cleanup() {
  if (runIds.size > 0) await prisma.positionHistoryReplayRun.deleteMany({ where: { id: { in: [...runIds] } } });
  if (vehicleIds.size > 0) {
    const ids = [...vehicleIds];
    await prisma.vehicleHistoryIngestionCursor.deleteMany({ where: { vehicleId: { in: ids } } });
    await prisma.vehiclePositionObservation.deleteMany({ where: { vehicleId: { in: ids } } });
    await prisma.vehiclePositionBackfillCheckpoint.deleteMany({ where: { vehicleId: { in: ids } } });
    await prisma.vehicle.deleteMany({ where: { id: { in: ids } } });
  }
}

test("migration adds only replay structures and preserves existing correctness data", async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  const schema = `replay_migration_${crypto.randomBytes(8).toString("hex")}`;
  const migrationsRoot = path.resolve(__dirname, "../prisma/migrations");
  const migrationNames = fs.readdirSync(migrationsRoot).filter((name) => fs.existsSync(path.join(migrationsRoot, name, "migration.sql"))).sort();
  const replayMigration = "20260913210000_add_position_history_replay_generations";
  assert.equal(migrationNames.at(-1), replayMigration);
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    for (const migrationName of migrationNames.slice(0, -1)) await applyMigrationSql(client, fs.readFileSync(path.join(migrationsRoot, migrationName, "migration.sql"), "utf8"));

    const vehicleId = crypto.randomUUID();
    const observationId = crypto.randomUUID();
    const finiteCheckpointId = crypto.randomUUID();
    const populationRunId = crypto.randomUUID();
    const at = "2026-09-13T00:00:00Z";
    await client.query(`INSERT INTO "vehicles" ("id", "external_device_id", "name", "disabled", "created_at", "updated_at") VALUES ($1, 1999999999, 'preserved', false, $2, $2)`, [vehicleId, at]);
    await client.query(`INSERT INTO "vehicle_position_observations" ("id", "vehicle_id", "fix_fingerprint", "observed_at", "latitude", "longitude", "speed_kph", "valid", "outdated", "fetched_at", "ingestion_source", "created_at") VALUES ($1, $2, $3, $4, 49.2, 28.4, 10, true, false, $4, 'HISTORICAL_BACKFILL', $4)`, [observationId, vehicleId, "a".repeat(64), "2026-09-12T00:00:00Z"]);
    await client.query(`INSERT INTO "vehicle_position_backfill_checkpoints" ("id", "vehicle_id", "range_from", "range_to", "next_from", "status", "created_at", "updated_at") VALUES ($1, $2, $3, $4, $4, 'COMPLETED', $3, $4)`, [finiteCheckpointId, vehicleId, "2026-09-11T00:00:00Z", "2026-09-12T00:00:00Z"]);
    await client.query(`INSERT INTO "vehicle_history_ingestion_cursors" ("vehicle_id", "coverage_from", "confirmed_through", "created_at", "updated_at") VALUES ($1, $2, $2, $2, $2)`, [vehicleId, "2026-06-15T00:00:00Z"]);
    await client.query(`INSERT INTO "position_history_population_runs" ("id", "status", "initiator_type", "to", "exclude_provider_disabled", "window_budget", "created_at", "updated_at") VALUES ($1, 'PENDING', 'SYSTEM', $2, false, 1, $2, $2)`, [populationRunId, at]);
    const before = await client.query(`SELECT (SELECT count(*) FROM "vehicle_position_observations")::int observations, (SELECT count(*) FROM "vehicle_position_backfill_checkpoints")::int finite_checkpoints, (SELECT count(*) FROM "vehicle_history_ingestion_cursors")::int cursors, (SELECT count(*) FROM "position_history_population_runs")::int population_runs`);

    await applyMigrationSql(client, fs.readFileSync(path.join(migrationsRoot, replayMigration, "migration.sql"), "utf8"));
    const after = await client.query(`SELECT (SELECT count(*) FROM "vehicle_position_observations")::int observations, (SELECT count(*) FROM "vehicle_position_backfill_checkpoints")::int finite_checkpoints, (SELECT count(*) FROM "vehicle_history_ingestion_cursors")::int cursors, (SELECT count(*) FROM "position_history_population_runs")::int population_runs`);
    assert.deepEqual(after.rows[0], before.rows[0]);
    assert.deepEqual((await client.query(`SELECT (SELECT count(*) FROM "position_history_replay_runs")::int runs, (SELECT count(*) FROM "position_history_replay_checkpoints")::int checkpoints`)).rows[0], { runs: 0, checkpoints: 0 });
    const vehicleFk = await client.query(`SELECT confdeltype::text action FROM pg_constraint WHERE conrelid = 'position_history_replay_checkpoints'::regclass AND conname = 'position_history_replay_checkpoints_vehicle_id_fkey'`);
    const runFk = await client.query(`SELECT confdeltype::text action FROM pg_constraint WHERE conrelid = 'position_history_replay_checkpoints'::regclass AND conname = 'position_history_replay_checkpoints_run_id_fkey'`);
    assert.deepEqual(vehicleFk.rows, [{ action: "r" }]);
    assert.deepEqual(runFk.rows, [{ action: "c" }]);
  } finally {
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await client.end();
  }
});

test("W1 and W2 retain independent same-range replay truth despite an old completed finite checkpoint", async () => {
  const vehicleId = await createVehicle("generations");
  const rangeFrom = new Date("2026-06-01T00:00:00Z");
  const rangeTo = new Date("2026-06-08T00:00:00Z");
  await prisma.vehiclePositionBackfillCheckpoint.create({ data: { vehicleId, rangeFrom, rangeTo, nextFrom: rangeTo, status: PositionBackfillStatus.COMPLETED } });

  const w1 = await ensureRun({ kind: PositionHistoryReplayKind.ROLLING_90_DAY, generationAnchor: new Date("2026-09-01T00:00:00Z"), rangeFrom, rangeTo });
  assert.equal((await repository.ensureRun({ kind: w1.kind, generationAnchor: w1.generationAnchor, rangeFrom, rangeTo })).id, w1.id);
  const prisma2 = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    const repository2 = new PrismaPositionHistoryReplayRepository({ getClient: () => prisma2 });
    const concurrentAnchor = new Date("2026-09-15T00:00:00Z");
    const concurrent = await Promise.all([
      repository.ensureRun({ kind: PositionHistoryReplayKind.ROLLING_90_DAY, generationAnchor: concurrentAnchor, rangeFrom, rangeTo }),
      repository2.ensureRun({ kind: PositionHistoryReplayKind.ROLLING_90_DAY, generationAnchor: concurrentAnchor, rangeFrom, rangeTo }),
    ]);
    runIds.add(concurrent[0].id);
    assert.equal(concurrent[0].id, concurrent[1].id);
  } finally {
    await prisma2.$disconnect();
  }
  const daily = await ensureRun({ kind: PositionHistoryReplayKind.DAILY_7_DAY, generationAnchor: w1.generationAnchor, rangeFrom, rangeTo });
  assert.notEqual(daily.id, w1.id);
  await assert.rejects(repository.ensureRun({ kind: w1.kind, generationAnchor: w1.generationAnchor, rangeFrom: new Date(rangeFrom.getTime() + 1), rangeTo }), PositionHistoryReplayGenerationConflictError);

  const [w1Checkpoint] = await repository.ensureCheckpoints(w1.id, [{ vehicleId, rangeFrom, rangeTo }]);
  assert.equal(w1Checkpoint.status, PositionBackfillStatus.PENDING);
  assert.equal((await repository.ensureCheckpoints(w1.id, [{ vehicleId, rangeFrom, rangeTo }]))[0].id, w1Checkpoint.id);
  const owner = crypto.randomUUID();
  const now = new Date();
  assert.notEqual(await state.claimRun({ runId: w1.id, leaseOwner: owner, now, leaseExpiresAt: new Date(now.getTime() + 300_000) }), null);
  assert.deepEqual(await repository.persistReplayWindow({ runId: w1.id, leaseOwner: owner, checkpointId: w1Checkpoint.id, vehicleId, expectedNextFrom: rangeFrom, nextFrom: rangeTo, candidates: [] }), { inserted: 0, duplicates: 0, checkpointStatus: PositionBackfillStatus.COMPLETED });
  assert.equal(await state.completeRun({ runId: w1.id, leaseOwner: owner, now: new Date(now.getTime() + 1) }), true);
  const [completedW1Checkpoint] = await repository.ensureCheckpoints(w1.id, [{ vehicleId, rangeFrom, rangeTo }]);
  assert.equal(completedW1Checkpoint.id, w1Checkpoint.id);
  assert.equal(completedW1Checkpoint.status, PositionBackfillStatus.COMPLETED);

  const w2 = await ensureRun({ kind: PositionHistoryReplayKind.ROLLING_90_DAY, generationAnchor: new Date("2026-09-08T00:00:00Z"), rangeFrom, rangeTo });
  const [w2Checkpoint] = await repository.ensureCheckpoints(w2.id, [{ vehicleId, rangeFrom, rangeTo }]);
  assert.notEqual(w2Checkpoint.id, w1Checkpoint.id);
  assert.equal(w2Checkpoint.status, PositionBackfillStatus.PENDING);
  assert.equal(w2Checkpoint.nextFrom.toISOString(), rangeFrom.toISOString());
});

test("replay persistence is atomic, CAS-fenced, empty-window capable, and cursor-independent", async () => {
  const vehicleId = await createVehicle("atomic");
  const rangeFrom = new Date("2026-09-10T00:00:00Z");
  const middle = new Date("2026-09-10T06:00:00Z");
  const rangeTo = new Date("2026-09-10T12:00:00Z");
  const run = await ensureRun({ kind: PositionHistoryReplayKind.DAILY_7_DAY, generationAnchor: new Date("2026-09-11T00:00:00Z"), rangeFrom, rangeTo });
  const [checkpoint] = await repository.ensureCheckpoints(run.id, [{ vehicleId, rangeFrom, rangeTo }]);
  const cursorBefore = await prisma.vehicleHistoryIngestionCursor.create({ data: { vehicleId, coverageFrom: rangeFrom, confirmedThrough: rangeFrom } });
  const owner = crypto.randomUUID();
  const now = new Date();
  await state.claimRun({ runId: run.id, leaseOwner: owner, now, leaseExpiresAt: new Date(now.getTime() + 300_000) });

  const first = candidate("2026-09-10T00:10:00Z", 49.1);
  assert.deepEqual(await repository.persistReplayWindow({ runId: run.id, leaseOwner: owner, checkpointId: checkpoint.id, vehicleId, expectedNextFrom: rangeFrom, nextFrom: middle, candidates: [first] }), { inserted: 1, duplicates: 0, checkpointStatus: PositionBackfillStatus.RUNNING });
  assert.equal((await prisma.positionHistoryReplayCheckpoint.findUnique({ where: { id: checkpoint.id } })).nextFrom.toISOString(), middle.toISOString());
  const [resumedCheckpoint] = await repository.ensureCheckpoints(run.id, [{ vehicleId, rangeFrom, rangeTo }]);
  assert.equal(resumedCheckpoint.id, checkpoint.id);
  assert.equal(resumedCheckpoint.nextFrom.toISOString(), middle.toISOString());
  assert.equal(resumedCheckpoint.status, PositionBackfillStatus.RUNNING);

  const stale = candidate("2026-09-10T00:20:00Z", 49.2);
  await assert.rejects(repository.persistReplayWindow({ runId: run.id, leaseOwner: owner, checkpointId: checkpoint.id, vehicleId, expectedNextFrom: rangeFrom, nextFrom: rangeTo, candidates: [stale] }), PositionHistoryReplayCheckpointStaleProgressError);
  assert.equal(await prisma.vehiclePositionObservation.count({ where: { vehicleId, fixFingerprint: stale.fixFingerprint } }), 0);

  const wrongOwner = candidate("2026-09-10T01:20:00Z", 49.3);
  await assert.rejects(repository.persistReplayWindow({ runId: run.id, leaseOwner: crypto.randomUUID(), checkpointId: checkpoint.id, vehicleId, expectedNextFrom: middle, nextFrom: rangeTo, candidates: [wrongOwner] }), PositionHistoryReplayCheckpointStaleProgressError);
  assert.equal(await prisma.vehiclePositionObservation.count({ where: { vehicleId, fixFingerprint: wrongOwner.fixFingerprint } }), 0);

  const invalid = candidate("2026-09-10T01:30:00Z", 49.4, "invalid");
  await assert.rejects(repository.persistReplayWindow({ runId: run.id, leaseOwner: owner, checkpointId: checkpoint.id, vehicleId, expectedNextFrom: middle, nextFrom: rangeTo, candidates: [invalid] }));
  assert.equal((await prisma.positionHistoryReplayCheckpoint.findUnique({ where: { id: checkpoint.id } })).nextFrom.toISOString(), middle.toISOString());

  assert.deepEqual(await repository.persistReplayWindow({ runId: run.id, leaseOwner: owner, checkpointId: checkpoint.id, vehicleId, expectedNextFrom: middle, nextFrom: rangeTo, candidates: [] }), { inserted: 0, duplicates: 0, checkpointStatus: PositionBackfillStatus.COMPLETED });
  const cursorAfter = await prisma.vehicleHistoryIngestionCursor.findUnique({ where: { vehicleId } });
  assert.equal(cursorAfter.confirmedThrough.toISOString(), cursorBefore.confirmedThrough.toISOString());
  assert.equal(cursorAfter.coverageFrom.toISOString(), cursorBefore.coverageFrom.toISOString());
});

test("independent clients admit one lease owner, preserve progress across yield/restart, and reclaim safely", async () => {
  const vehicleId = await createVehicle("lease");
  const rangeFrom = new Date("2026-09-01T00:00:00Z");
  const rangeTo = new Date("2026-09-01T01:00:00Z");
  const run = await ensureRun({ kind: PositionHistoryReplayKind.DAILY_7_DAY, generationAnchor: new Date("2026-09-12T00:00:00Z"), rangeFrom, rangeTo });
  await repository.ensureCheckpoints(run.id, [{ vehicleId, rangeFrom, rangeTo }]);
  const prisma2 = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  const state2 = new PositionHistoryReplayRunStateService({ getClient: () => prisma2 });
  const ownerA = crypto.randomUUID();
  const ownerB = crypto.randomUUID();
  const now = new Date();
  const expires = new Date(now.getTime() + 300_000);
  try {
    const claims = await Promise.all([
      state.claimRun({ runId: run.id, leaseOwner: ownerA, now, leaseExpiresAt: expires }),
      state2.claimRun({ runId: run.id, leaseOwner: ownerB, now, leaseExpiresAt: expires }),
    ]);
    assert.equal(claims.filter((value) => value !== null).length, 1);
    const winner = claims[0] !== null ? ownerA : ownerB;
    const winningState = winner === ownerA ? state : state2;
    assert.equal(await winningState.yieldRun({ runId: run.id, leaseOwner: winner, now: new Date(now.getTime() + 1) }), true);
    const restartedState = new PositionHistoryReplayRunStateService({ getClient: () => prisma2 });
    const resumed = await restartedState.claimRun({ runId: run.id, leaseOwner: crypto.randomUUID(), now: new Date(now.getTime() + 2), leaseExpiresAt: new Date(now.getTime() + 300_002) });
    assert.notEqual(resumed, null);
    assert.equal(resumed.startedAt.toISOString(), now.toISOString());
    assert.equal((await repository.listIncompleteCheckpoints(run.id, 10)).length, 1);
  } finally {
    await prisma2.$disconnect();
  }
});

test.after(async () => { await cleanup(); await prisma.$disconnect(); });
