import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schema = readFileSync("prisma/schema.prisma", "utf8");
const migration = readFileSync("prisma/migrations/20260913000000_add_vehicle_history_ingestion_cursors/migration.sql", "utf8");
const executableMigration = migration.replace(/--.*$/gm, "");

test("cursor schema is one-to-one, timestamp-precise, restrictive, and lag-indexed", () => {
  assert.match(schema, /model VehicleHistoryIngestionCursor \{/);
  assert.match(schema, /vehicleId\s+String\s+@id @map\("vehicle_id"\) @db\.Uuid/);
  assert.match(schema, /coverageFrom\s+DateTime\s+@map\("coverage_from"\) @db\.Timestamptz\(6\)/);
  assert.match(schema, /confirmedThrough\s+DateTime\s+@map\("confirmed_through"\) @db\.Timestamptz\(6\)/);
  assert.match(schema, /vehicle\s+Vehicle\s+@relation\(fields: \[vehicleId\], references: \[id\], onDelete: Restrict\)/);
  assert.match(schema, /@@index\(\[confirmedThrough\], map: "vehicle_history_ingestion_cursors_confirmed_through_idx"\)/);
  assert.doesNotMatch(schema, /model VehicleHistoryIngestionCursor \{[^}]*lastSuccessAt/s);
});

test("cursor migration is additive and contains no data rewrite or automatic work", () => {
  assert.equal((executableMigration.match(/CREATE TABLE/g) ?? []).length, 1);
  assert.match(executableMigration, /CREATE TABLE "vehicle_history_ingestion_cursors"/);
  assert.match(executableMigration, /CHECK \([\s\S]*isfinite\("coverage_from"\)[\s\S]*"coverage_from" <= "confirmed_through"[\s\S]*\)/);
  assert.match(executableMigration, /ON DELETE RESTRICT ON UPDATE CASCADE/);
  assert.doesNotMatch(executableMigration, /^\s*(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/im);
  assert.doesNotMatch(executableMigration, /vehicle_position_observations[\s\S]*(?:ALTER|DROP)/i);
  assert.doesNotMatch(executableMigration, /vehicle_position_backfill_checkpoints/i);
});
