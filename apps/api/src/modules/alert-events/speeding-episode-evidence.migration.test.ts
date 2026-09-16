import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const sql = readFileSync(resolve(__dirname, "../../../prisma/migrations/20260916120000_add_speeding_episode_evidence/migration.sql"), "utf8");
const executable = sql.replace(/--.*$/gm, "");

test("migration extends exact confirmation receipts without heuristic legacy backfill", () => {
  for (const column of ["speeding_streak_started_at", "speeding_streak_start_latitude", "speeding_streak_start_longitude", "last_speeding_observed_at", "last_speeding_latitude", "last_speeding_longitude"]) assert.match(sql, new RegExp(`ADD COLUMN "${column}"`));
  assert.doesNotMatch(executable, /^\s*(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/im);
  for (const forbidden of ["nearest", "interpolate", "provider", "vehicle_position_observations"]) assert.equal(executable.toLowerCase().includes(forbidden), false, forbidden);
});

test("confirmation evidence is all-null or complete, finite, coordinate-bounded, and time-ordered", () => {
  assert.match(sql, /alert_event_confirmations_speeding_evidence_complete/);
  assert.match(sql, /BETWEEN -90 AND 90/); assert.match(sql, /BETWEEN -180 AND 180/);
  assert.match(sql, /'-Infinity'::DOUBLE PRECISION/); assert.match(sql, /'Infinity'::DOUBLE PRECISION/);
  assert.match(sql, /"speeding_streak_started_at" <= "observed_at"/);
  assert.match(sql, /"observed_at" <= "last_speeding_observed_at"/);
  assert.doesNotMatch(sql, /SELECT[\s\S]*CHECK/i);
});

test("durable detector checkpoint is one row per vehicle with complete context and streak invariants", () => {
  assert.match(sql, /CREATE TABLE "speeding_detector_checkpoints"/);
  assert.match(sql, /PRIMARY KEY \("vehicle_id"\)/);
  assert.match(sql, /settings_fingerprint" ~ '\^\[0-9a-f\]\{64\}\$'/);
  assert.match(sql, /speeding_detector_checkpoints_context_complete/);
  assert.match(sql, /speeding_detector_checkpoints_state_consistent/);
  assert.match(sql, /NOT "confirmed" OR "consecutive_count" >= "context_confirmation_required"/);
  assert.match(sql, /"confirmed" OR "consecutive_count" < COALESCE\("context_confirmation_required", 1\)/);
  assert.match(sql, /isfinite\("updated_at"\)/);
  assert.match(sql, /speeding_detector_checkpoints_time_order/);
  assert.match(sql, /ON DELETE RESTRICT ON UPDATE CASCADE/);
});
