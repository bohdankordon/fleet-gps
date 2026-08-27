import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { PositionHistoryPopulationRunInitiatorType, PositionHistoryPopulationRunStatus } from "../../generated/prisma/client";

const schema = readFileSync("prisma/schema.prisma", "utf8");
const migrationDirectory = "prisma/migrations/20260813120000_add_position_history_population_runs";
const migration = readFileSync(`${migrationDirectory}/migration.sql`, "utf8");

test("schema exposes the exact durable statuses, initiators, timestamps, defaults, and nullable SET NULL user relation", () => {
  assert.deepEqual(Object.values(PositionHistoryPopulationRunStatus), ["PENDING", "RUNNING", "SUCCEEDED", "FAILED"]);
  assert.deepEqual(Object.values(PositionHistoryPopulationRunInitiatorType), ["USER", "SYSTEM"]);
  assert.match(schema, /model PositionHistoryPopulationRun/);
  assert.match(schema, /committedWindows\s+Int\s+@default\(0\)/);
  assert.match(schema, /to\s+DateTime\s+@map\("to"\) @db\.Timestamptz\(6\)/);
  assert.match(schema, /requestedByUserId\s+String\?/);
  assert.match(schema, /onDelete: SetNull/);
});

test("the one Stage 18A migration adds only durable-run schema with database budget and active-run constraints", () => {
  assert.equal(readdirSync("prisma/migrations", { withFileTypes: true }).some((entry) => entry.isDirectory() && entry.name === "20260813120000_add_position_history_population_runs"), true);
  assert.equal(readdirSync(migrationDirectory).length, 1);
  assert.match(migration, /CHECK \("window_budget" > 0\)/);
  assert.match(migration, /CHECK \("committed_windows" >= 0\)/);
  assert.match(migration, /CHECK \("committed_windows" <= "window_budget"\)/);
  assert.match(migration, /CREATE UNIQUE INDEX "position_history_population_runs_one_active_idx"[\s\S]*WHERE "status" IN \('PENDING', 'RUNNING'\)/);
  assert.match(migration, /ON DELETE SET NULL/);
  assert.doesNotMatch(migration, /^\s*(?:DROP|TRUNCATE|DELETE)\b|vehicle_position_(?:observations|backfill_checkpoints)/im);
});
