const assert = require("node:assert/strict");
const test = require("node:test");
const { performance } = require("node:perf_hooks");
const { PrismaPg } = require("@prisma/adapter-pg");
const { PrismaClient } = require("../dist/generated/prisma/client");
const { PrismaPositionHistoryRetentionRepository } = require("../dist/modules/position-history-retention/prisma-position-history-retention.repository");
const { PositionHistoryRetentionService } = require("../dist/modules/position-history-retention/position-history-retention.service");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const database = { getClient: () => prisma };
const protectedTables = [
  "vehicles",
  "vehicle_current_states",
  "daily_vehicle_stats",
  "vehicle_position_observations",
  "vehicle_position_backfill_checkpoints",
  "position_history_population_runs",
  "alert_evaluation_observations",
  "alert_events",
  "alert_notification_outbox",
  "application_settings",
  "auth_users",
  "auth_user_permissions",
  "auth_sessions",
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

test("Stage 19A planner is a real PostgreSQL read with exact before/after equality", async () => {
  const before = await exactSnapshot();
  const migrations = await prisma.$queryRaw`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
  assert.equal(migrations.length, 10);
  assert.equal(await prisma.positionHistoryPopulationRun.count({ where: { status: { in: ["PENDING", "RUNNING"] } } }), 0, "an active durable population run could invalidate the read-only audit");

  const planner = new PositionHistoryRetentionService(new PrismaPositionHistoryRetentionRepository(database), { now: () => new Date() }, null);
  const startedAt = performance.now();
  const plan = await planner.getRetentionPlan();
  const queryDurationMs = performance.now() - startedAt;
  const after = await exactSnapshot();
  assert.deepEqual(after, before);
  assert.equal(plan.observations.olderThanPolicyCutoff + plan.observations.atOrAfterPolicyCutoff, plan.observations.total);
  assert.equal(plan.checkpoints.fullyObsolete + plan.checkpoints.boundaryOverlap + plan.checkpoints.protected, plan.checkpoints.total);
  assert.equal(plan.checkpoints.endingExactlyAtCutoff + plan.checkpoints.strictlyCrossingCutoff, plan.checkpoints.boundaryOverlap);
  assert.equal(plan.safety.destructiveExecutionApproved, false);

  process.stdout.write(`${JSON.stringify({ plan, queryDurationMs: Number(queryDurationMs.toFixed(3)), before, after, identical: true }, null, 2)}\n`);
});

test.after(async () => { await prisma.$disconnect(); });
