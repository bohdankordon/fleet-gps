const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Client } = require("pg");
const { assertContainerTestDatabaseUrl } = require("./assert-container-test-database-url.cjs");
const { assertTestDatabaseUrl } = require("./assert-test-database-url.cjs");
const { PositionIngestionSource, PrismaClient } = require("../dist/generated/prisma/client");
const { normalizePositionHistoryCandidate } = require("../dist/modules/position-history");
const { PositionHistoryIngestionCursorInvalidAdvanceError, PositionHistoryIngestionCursorStaleProgressError, PositionHistoryIngestionCursorVehicleNotFoundError } = require("../dist/modules/position-history-ingestion-cursor");
const { PositionHistoryIngestionCursorService } = require("../dist/modules/position-history-ingestion-cursor/position-history-ingestion-cursor.service");
const { PrismaPositionHistoryIngestionCursorRepository } = require("../dist/modules/position-history-ingestion-cursor/prisma-position-history-ingestion-cursor.repository");

if (process.env.TEST_DATABASE_RUNNER === "linux") assertContainerTestDatabaseUrl();
else assertTestDatabaseUrl();

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const repository = new PrismaPositionHistoryIngestionCursorRepository({ getClient: () => prisma });
const service = new PositionHistoryIngestionCursorService(repository);
const vehicleIds = new Set();

async function applyMigrationSql(client, sql) {
  const executable = sql.replace(/--.*$/gm, "");
  for (const statement of executable.split(";").map((value) => value.trim()).filter(Boolean)) await client.query(statement);
}

function candidate({ observedAt, source = PositionIngestionSource.HISTORICAL_BACKFILL, latitude = 49.2, longitude = 28.4, speedKph = 12.5 }) {
  const value = normalizePositionHistoryCandidate({ observedAt, latitude, longitude, speedKph, valid: true, outdated: false, fetchedAt: new Date("2026-09-13T12:40:00Z"), ingestionSource: source });
  assert.notEqual(value, null);
  return value;
}

async function cleanup() {
  const ids = [...vehicleIds];
  if (ids.length === 0) return;
  await prisma.vehicleHistoryIngestionCursor.deleteMany({ where: { vehicleId: { in: ids } } });
  await prisma.vehiclePositionObservation.deleteMany({ where: { vehicleId: { in: ids } } });
  await prisma.vehicleCurrentState.deleteMany({ where: { vehicleId: { in: ids } } });
  await prisma.vehiclePositionBackfillCheckpoint.deleteMany({ where: { vehicleId: { in: ids } } });
  await prisma.vehicle.deleteMany({ where: { id: { in: ids } } });
}

test("migration applies over the previous schema without changing observations or checkpoints", async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  const schema = `cursor_migration_${crypto.randomBytes(8).toString("hex")}`;
  const migrationsRoot = path.resolve(__dirname, "../prisma/migrations");
  const migrationNames = fs.readdirSync(migrationsRoot).filter((name) => fs.existsSync(path.join(migrationsRoot, name, "migration.sql"))).sort();
  const cursorMigration = "20260913000000_add_vehicle_history_ingestion_cursors";
  const cursorMigrationIndex = migrationNames.indexOf(cursorMigration);
  assert.ok(cursorMigrationIndex > 0);
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    for (const migrationName of migrationNames.slice(0, cursorMigrationIndex)) {
      await applyMigrationSql(client, fs.readFileSync(path.join(migrationsRoot, migrationName, "migration.sql"), "utf8"));
    }

    const vehicleId = crypto.randomUUID();
    const observationId = crypto.randomUUID();
    const checkpointId = crypto.randomUUID();
    await client.query(`INSERT INTO "vehicles" ("id", "external_device_id", "name", "disabled", "created_at", "updated_at") VALUES ($1, 2000000000, 'migration-fixture', false, $2, $2)`, [vehicleId, "2026-09-13T00:00:00Z"]);
    await client.query(`INSERT INTO "vehicle_position_observations" ("id", "vehicle_id", "fix_fingerprint", "observed_at", "latitude", "longitude", "speed_kph", "valid", "outdated", "fetched_at", "ingestion_source", "created_at") VALUES ($1, $2, $3, $4, 49.2, 28.4, 10, true, false, $4, 'HISTORICAL_BACKFILL', $4)`, [observationId, vehicleId, "a".repeat(64), "2026-09-12T00:00:00Z"]);
    await client.query(`INSERT INTO "vehicle_position_backfill_checkpoints" ("id", "vehicle_id", "range_from", "range_to", "next_from", "status", "created_at", "updated_at") VALUES ($1, $2, $3, $4, $4, 'COMPLETED', $3, $4)`, [checkpointId, vehicleId, "2026-09-11T00:00:00Z", "2026-09-12T00:00:00Z"]);
    const before = await client.query(`SELECT (SELECT count(*) FROM "vehicle_position_observations")::int AS observations, (SELECT count(*) FROM "vehicle_position_backfill_checkpoints")::int AS checkpoints`);

    await applyMigrationSql(client, fs.readFileSync(path.join(migrationsRoot, cursorMigration, "migration.sql"), "utf8"));
    const after = await client.query(`SELECT (SELECT count(*) FROM "vehicle_position_observations")::int AS observations, (SELECT count(*) FROM "vehicle_position_backfill_checkpoints")::int AS checkpoints`);
    assert.deepEqual(after.rows[0], before.rows[0]);
    assert.deepEqual((await client.query(`SELECT "id" FROM "vehicle_position_observations" WHERE "id" = $1`, [observationId])).rows, [{ id: observationId }]);
    assert.deepEqual((await client.query(`SELECT "id" FROM "vehicle_position_backfill_checkpoints" WHERE "id" = $1`, [checkpointId])).rows, [{ id: checkpointId }]);

    const constraints = await client.query(`SELECT conname, confdeltype::text AS delete_action FROM pg_constraint WHERE conrelid = 'vehicle_history_ingestion_cursors'::regclass ORDER BY conname`);
    assert.deepEqual(constraints.rows, [
      { conname: "vehicle_history_ingestion_cursors_pkey", delete_action: " " },
      { conname: "vehicle_history_ingestion_cursors_progress_valid", delete_action: " " },
      { conname: "vehicle_history_ingestion_cursors_vehicle_id_fkey", delete_action: "r" },
    ]);
    const indexes = await client.query(`SELECT indexname FROM pg_indexes WHERE schemaname = $1 AND tablename = 'vehicle_history_ingestion_cursors' ORDER BY indexname`, [schema]);
    assert.deepEqual(indexes.rows.map(({ indexname }) => indexname), ["vehicle_history_ingestion_cursors_confirmed_through_idx", "vehicle_history_ingestion_cursors_pkey"]);

    await assert.rejects(client.query(`INSERT INTO "vehicle_history_ingestion_cursors" ("vehicle_id", "coverage_from", "confirmed_through", "created_at", "updated_at") VALUES ($1, $2, $3, $2, $2)`, [vehicleId, "2026-09-13T00:00:00Z", "2026-09-12T00:00:00Z"]));
    await assert.rejects(client.query(`INSERT INTO "vehicle_history_ingestion_cursors" ("vehicle_id", "coverage_from", "confirmed_through", "created_at", "updated_at") VALUES ($1, '-infinity', 'infinity', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`, [vehicleId]));
    await client.query(`INSERT INTO "vehicle_history_ingestion_cursors" ("vehicle_id", "coverage_from", "confirmed_through", "created_at", "updated_at") VALUES ($1, $2, $2, $2, $2)`, [vehicleId, "2026-06-09T02:00:00Z"]);
    await assert.rejects(client.query(`DELETE FROM "vehicles" WHERE "id" = $1`, [vehicleId]));
  } finally {
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await client.end();
  }
});

test("real PostgreSQL cursor contract is conservative, idempotent, atomic, and race-safe", async () => {
  const vehicleId = crypto.randomUUID();
  vehicleIds.add(vehicleId);
  const fixedNow = new Date("2026-09-13T12:34:56.789Z");
  const t0 = new Date("2026-06-10T02:00:00Z");
  const t1 = new Date("2026-06-10T02:05:00Z");
  const t2 = new Date("2026-06-10T02:10:00Z");
  const t3 = new Date("2026-06-10T02:15:00Z");
  await prisma.vehicle.create({ data: { id: vehicleId, externalDeviceId: 1900000000 + Math.floor(Math.random() * 90000000), name: "cursor-real-db-fixture", disabled: true } });
  await prisma.vehicleCurrentState.create({ data: { vehicleId, fixTime: new Date("2026-09-13T12:30:00Z") } });
  const latest = candidate({ observedAt: new Date("2026-09-13T12:30:00Z"), source: PositionIngestionSource.FLEET_SYNC });
  await prisma.vehiclePositionObservation.create({ data: { vehicleId, ...latest } });

  try {
    const created = await service.ensureCursor(vehicleId, fixedNow);
    assert.equal(created.coverageFrom.toISOString(), t0.toISOString());
    assert.equal(created.confirmedThrough.toISOString(), t0.toISOString());
    const ensuredAgain = await service.ensureCursor(vehicleId, new Date("2026-09-20T12:00:00Z"));
    assert.equal(ensuredAgain.coverageFrom.toISOString(), t0.toISOString());
    assert.equal(ensuredAgain.confirmedThrough.toISOString(), t0.toISOString());
    assert.deepEqual(await service.persistContiguousResult({ vehicleId, expectedCoverageFrom: t0, expectedConfirmedThrough: t0, nextConfirmedThrough: t1, candidates: [] }), { inserted: 0, duplicates: 0 });

    const duplicateLive = candidate({ observedAt: new Date("2026-06-10T02:01:00Z"), source: PositionIngestionSource.FLEET_SYNC, latitude: 49.21 });
    await prisma.vehiclePositionObservation.create({ data: { vehicleId, ...duplicateLive } });
    const duplicateHistorical = { ...duplicateLive, ingestionSource: PositionIngestionSource.HISTORICAL_BACKFILL };
    const normal = candidate({ observedAt: new Date("2026-06-10T02:07:00Z"), latitude: 49.22 });
    const overlap = candidate({ observedAt: new Date("2026-06-10T02:03:00Z"), latitude: 49.23 });
    const persisted = await service.persistContiguousResult({ vehicleId, expectedCoverageFrom: t0, expectedConfirmedThrough: t1, nextConfirmedThrough: t2, candidates: [duplicateHistorical, normal, overlap] });
    assert.deepEqual(persisted, { inserted: 2, duplicates: 1 });
    assert.ok(overlap.observedAt < t1);
    assert.equal((await prisma.vehiclePositionObservation.findUnique({ where: { vehicleId_fixFingerprint: { vehicleId, fixFingerprint: duplicateLive.fixFingerprint } } })).ingestionSource, PositionIngestionSource.FLEET_SYNC);

    const staleOnly = candidate({ observedAt: new Date("2026-06-10T02:11:00Z"), latitude: 49.24 });
    await assert.rejects(service.persistContiguousResult({ vehicleId, expectedCoverageFrom: t0, expectedConfirmedThrough: t1, nextConfirmedThrough: t3, candidates: [staleOnly] }), PositionHistoryIngestionCursorStaleProgressError);
    assert.equal(await prisma.vehiclePositionObservation.count({ where: { vehicleId, fixFingerprint: staleOnly.fixFingerprint } }), 0);

    const invalid = { ...candidate({ observedAt: new Date("2026-06-10T02:12:00Z"), latitude: 49.25 }), fixFingerprint: "invalid" };
    await assert.rejects(service.persistContiguousResult({ vehicleId, expectedCoverageFrom: t0, expectedConfirmedThrough: t2, nextConfirmedThrough: t3, candidates: [invalid] }));
    assert.equal((await service.findCursor(vehicleId)).confirmedThrough.toISOString(), t2.toISOString());

    const raceA = candidate({ observedAt: new Date("2026-06-10T02:13:00Z"), latitude: 49.26 });
    const raceB = candidate({ observedAt: new Date("2026-06-10T02:14:00Z"), latitude: 49.27 });
    const race = await Promise.allSettled([
      service.persistContiguousResult({ vehicleId, expectedCoverageFrom: t0, expectedConfirmedThrough: t2, nextConfirmedThrough: t3, candidates: [raceA] }),
      service.persistContiguousResult({ vehicleId, expectedCoverageFrom: t0, expectedConfirmedThrough: t2, nextConfirmedThrough: t3, candidates: [raceB] }),
    ]);
    assert.equal(race.filter(({ status }) => status === "fulfilled").length, 1);
    assert.equal(race.filter(({ status, reason }) => status === "rejected" && reason instanceof PositionHistoryIngestionCursorStaleProgressError).length, 1);
    assert.equal(await prisma.vehiclePositionObservation.count({ where: { vehicleId, fixFingerprint: { in: [raceA.fixFingerprint, raceB.fixFingerprint] } } }), 1);
    assert.equal((await service.findCursor(vehicleId)).confirmedThrough.toISOString(), t3.toISOString());

    await assert.rejects(service.persistContiguousResult({ vehicleId, expectedCoverageFrom: t0, expectedConfirmedThrough: t3, nextConfirmedThrough: new Date(t0.getTime() - 1), candidates: [] }), PositionHistoryIngestionCursorInvalidAdvanceError);
    await assert.rejects(service.ensureCursor(crypto.randomUUID(), fixedNow), PositionHistoryIngestionCursorVehicleNotFoundError);
  } finally {
    await cleanup();
  }
});

test.after(async () => { await cleanup(); await prisma.$disconnect(); });
