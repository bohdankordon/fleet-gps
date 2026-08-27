import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("prisma/migrations/20260827010000_add_trip_stop_policy_settings/migration.sql", "utf8");

test("trip/stop global settings migration is additive, preserves defaults, and constrains every scalar", () => {
  for (const column of ["trip_movement_speed_kph", "trip_movement_confirmation_seconds", "trip_stop_confirmation_seconds", "trip_data_gap_seconds"]) assert.match(migration, new RegExp(`ADD COLUMN "${column}" INTEGER NOT NULL DEFAULT`));
  for (const expected of ["DEFAULT 5", "DEFAULT 60", "DEFAULT 300", "BETWEEN 1 AND 200", "BETWEEN 1 AND 604800"]) assert.ok(migration.includes(expected), expected);
  assert.doesNotMatch(migration, /^\s*(?:DROP|TRUNCATE|DELETE|UPDATE)\b/im);
});
