import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const migrationPath = resolve(__dirname, "../../../prisma/migrations/20260915150000_add_speeding_confirmation_position/migration.sql");
const sql = readFileSync(migrationPath, "utf8");
const executableSql = sql.replace(/--.*$/gm, "");

test("migration is additive, nullable, and backfills only exact local evidence identity", () => {
  assert.match(sql, /ADD COLUMN "confirmation_latitude" DOUBLE PRECISION/);
  assert.match(sql, /ADD COLUMN "confirmation_longitude" DOUBLE PRECISION/);
  assert.doesNotMatch(sql, /NOT NULL/);
  assert.match(sql, /evidence\."vehicle_id" = event\."vehicle_id"/);
  assert.match(sql, /evidence\."observed_at" = event\."confirmed_at"/);
  assert.match(sql, /event\."type" = 'SPEEDING'/);
  for (const forbidden of ["interval", "nearest", "order by", "limit 1", "vehicle_position_observations", "provider"]) assert.equal(executableSql.toLowerCase().includes(forbidden), false, forbidden);
});

test("migration enforces pair, finite latitude/longitude range, and SPEEDING ownership", () => {
  assert.match(sql, /confirmation_position_pair/);
  assert.match(sql, /BETWEEN -90 AND 90/);
  assert.match(sql, /BETWEEN -180 AND 180/);
  assert.match(sql, /'-Infinity'::DOUBLE PRECISION/);
  assert.match(sql, /'Infinity'::DOUBLE PRECISION/);
  assert.match(sql, /confirmation_position_speeding_only/);
});
