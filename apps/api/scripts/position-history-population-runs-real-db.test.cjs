const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient, PositionHistoryPopulationRunInitiatorType, PositionHistoryPopulationRunStatus } = require("../dist/generated/prisma/client");
const { PositionHistoryPopulationRunCreationService } = require("../dist/modules/position-history-population-runs/position-history-population-run-creation.service");
const { PositionHistoryPopulationRunConflictError } = require("../dist/modules/position-history-population-runs/position-history-population-run.errors");
const { PositionHistoryPopulationRunStateService } = require("../dist/modules/position-history-population-runs/position-history-population-run-state.service");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const database = { getClient: () => prisma };
const creation = new PositionHistoryPopulationRunCreationService(database);
const ids = new Set();
const protectedTables = [
  "vehicles", "vehicle_current_states", "daily_vehicle_stats", "vehicle_position_observations", "vehicle_position_backfill_checkpoints",
  "alert_evaluation_observations", "alert_events", "alert_notification_outbox", "application_settings",
];

async function protectedSnapshot() {
  const snapshot = {};
  for (const table of protectedTables) {
    const rows = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::text AS count, COALESCE(SUM(hashtextextended(xmin::text || ':' || ctid::text, 0)::numeric), 0)::text AS version FROM "${table}"`);
    snapshot[table] = rows[0];
  }
  return snapshot;
}

async function cleanup() {
  if (ids.size > 0) await prisma.positionHistoryPopulationRun.deleteMany({ where: { id: { in: [...ids] } } });
}

function input(windowBudget = 50) {
  return { initiatorType: PositionHistoryPopulationRunInitiatorType.SYSTEM, to: new Date("2026-08-13T00:00:00.123Z"), excludeProviderDisabled: false, windowBudget };
}

test("real PostgreSQL durable-run constraints, concurrency, terminal history, and expired reclaim", async () => {
  const before = await protectedSnapshot();
  await cleanup();
  try {
    const migrations = await prisma.$queryRaw`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name`;
    assert.equal(migrations.length, 10);
    assert.equal(migrations.at(-1)?.migration_name, "20260813120000_add_position_history_population_runs");

    const constraintRows = await prisma.$queryRaw`SELECT conname, confdeltype::text AS confdeltype FROM pg_constraint WHERE conrelid = 'position_history_population_runs'::regclass`;
    assert.equal(constraintRows.some(({ conname }) => conname === "position_history_population_runs_window_budget_positive"), true);
    assert.equal(constraintRows.some(({ conname }) => conname === "position_history_population_runs_committed_windows_nonnegative"), true);
    assert.equal(constraintRows.some(({ conname }) => conname === "position_history_population_runs_committed_within_budget"), true);
    assert.equal(constraintRows.some(({ conname, confdeltype }) => conname === "position_history_population_runs_requested_by_user_id_fkey" && confdeltype === "n"), true);

    for (const [id, budget, committed] of [
      ["123e4567-e89b-42d3-a456-426614170001", 0, 0],
      ["123e4567-e89b-42d3-a456-426614170002", 1, -1],
      ["123e4567-e89b-42d3-a456-426614170003", 1, 2],
    ]) {
      ids.add(id);
      await assert.rejects(prisma.$executeRawUnsafe(
        `INSERT INTO "position_history_population_runs" ("id", "status", "initiator_type", "to", "exclude_provider_disabled", "window_budget", "committed_windows", "updated_at") VALUES ($1::uuid, 'FAILED', 'SYSTEM', $2, false, $3, $4, CURRENT_TIMESTAMP)`,
        id, new Date("2026-08-13T00:00:00Z"), budget, committed,
      ), (error) => error?.code === "P2010" || error?.meta?.driverAdapterError?.cause?.originalCode === "23514");
    }

    const outcomes = await Promise.allSettled([creation.createRun(input(500)), creation.createRun(input(1_000))]);
    const winner = outcomes.find((outcome) => outcome.status === "fulfilled").value;
    ids.add(winner.id);
    assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
    assert.equal(outcomes.filter((outcome) => outcome.status === "rejected" && outcome.reason instanceof PositionHistoryPopulationRunConflictError).length, 1);
    assert.equal(await prisma.positionHistoryPopulationRun.count({ where: { status: { in: [PositionHistoryPopulationRunStatus.PENDING, PositionHistoryPopulationRunStatus.RUNNING] } } }), 1);

    await prisma.positionHistoryPopulationRun.update({ where: { id: winner.id }, data: { status: PositionHistoryPopulationRunStatus.SUCCEEDED, finishedAt: new Date() } });
    const stale = await creation.createRun(input(50));
    ids.add(stale.id);
    const startedAt = new Date("2026-08-13T01:00:00Z");
    const expiredAt = new Date("2026-08-13T01:01:00Z");
    await prisma.positionHistoryPopulationRun.update({ where: { id: stale.id }, data: { status: PositionHistoryPopulationRunStatus.RUNNING, startedAt, committedWindows: 24, leaseOwner: crypto.randomUUID(), leaseExpiresAt: expiredAt } });
    const clockNow = new Date("2026-08-13T02:00:00Z");
    const state = new PositionHistoryPopulationRunStateService(database, { now: () => clockNow });
    const newOwner = crypto.randomUUID();
    const reclaimed = await state.claim(stale.id, newOwner);
    assert.equal(reclaimed.committedWindows, 24);
    assert.equal(reclaimed.startedAt.toISOString(), startedAt.toISOString());
    assert.equal(reclaimed.leaseOwner, newOwner);

    assert.equal(await state.succeed(stale.id, newOwner), true);
    const later = await creation.createRun(input(5_000));
    ids.add(later.id);
    await prisma.positionHistoryPopulationRun.update({ where: { id: later.id }, data: { status: PositionHistoryPopulationRunStatus.FAILED, finishedAt: new Date(), safeFailureCode: "ACCEPTANCE_ONLY" } });
    assert.equal(await prisma.positionHistoryPopulationRun.count({ where: { id: { in: [...ids] }, status: { in: [PositionHistoryPopulationRunStatus.SUCCEEDED, PositionHistoryPopulationRunStatus.FAILED] } } }), 3);
  } finally {
    await cleanup();
    assert.equal(await prisma.positionHistoryPopulationRun.count({ where: { id: { in: [...ids] } } }), 0);
    assert.deepEqual(await protectedSnapshot(), before);
  }
});

test.after(async () => { await cleanup(); await prisma.$disconnect(); });
