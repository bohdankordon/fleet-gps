import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PositionHistoryReplayKind, PositionHistoryReplayRunStatus } from "../../generated/prisma/client";

const schema = readFileSync("prisma/schema.prisma", "utf8");
const migration = readFileSync("prisma/migrations/20260913210000_add_position_history_replay_generations/migration.sql", "utf8");
const executable = migration.replace(/--.*$/gm, "");

test("replay schema has explicit generation kinds and a retryable leased lifecycle", () => {
  assert.deepEqual(Object.values(PositionHistoryReplayKind), ["DAILY_7_DAY", "ROLLING_90_DAY"]);
  assert.deepEqual(Object.values(PositionHistoryReplayRunStatus), ["PENDING", "RUNNING", "COMPLETED"]);
  assert.match(schema, /@@unique\(\[kind, generationAnchor\], map: "position_history_replay_runs_generation_key"\)/);
  assert.match(schema, /@@unique\(\[runId, vehicleId, rangeFrom, rangeTo\], map: "position_history_replay_checkpoints_target_key"\)/);
  assert.match(schema, /run\s+PositionHistoryReplayRun\s+@relation\(fields: \[runId\], references: \[id\], onDelete: Cascade\)/);
  assert.match(schema, /vehicle\s+Vehicle\s+@relation\(fields: \[vehicleId\], references: \[id\], onDelete: Restrict\)/);
});

test("migration is additive, precise, constrained, and leaves existing correctness tables untouched", () => {
  assert.equal((executable.match(/CREATE TABLE/g) ?? []).length, 2);
  assert.equal((executable.match(/CREATE TYPE/g) ?? []).length, 2);
  assert.match(executable, /UNIQUE INDEX "position_history_replay_runs_generation_key"[\s\S]*\("kind", "generation_anchor"\)/);
  assert.match(executable, /UNIQUE INDEX "position_history_replay_checkpoints_target_key"[\s\S]*\("run_id", "vehicle_id", "range_from", "range_to"\)/);
  assert.match(executable, /"range_from" < "range_to"/);
  assert.match(executable, /"range_from" <= "next_from"[\s\S]*"next_from" <= "range_to"/);
  assert.match(executable, /ON DELETE CASCADE ON UPDATE CASCADE/);
  assert.match(executable, /ON DELETE RESTRICT ON UPDATE CASCADE/);
  assert.doesNotMatch(executable, /^\s*(?:INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER TABLE "(?:vehicle_position_observations|vehicle_position_backfill_checkpoints|vehicle_history_ingestion_cursors|position_history_population_runs)")\b/im);
  for (const existing of ["vehicle_position_observations", "vehicle_position_backfill_checkpoints", "vehicle_history_ingestion_cursors", "position_history_population_runs"]) {
    assert.doesNotMatch(executable, new RegExp(`(?:CREATE|ALTER|DROP)\\s+TABLE\\s+"${existing}"`, "i"));
  }
});
