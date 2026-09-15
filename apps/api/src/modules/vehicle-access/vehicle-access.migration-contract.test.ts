import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schema = readFileSync("prisma/schema.prisma", "utf8");
const migration = readFileSync("prisma/migrations/20260915090000_add_vehicle_groups_access/migration.sql", "utf8");

test("migration preserves existing USER access and existing ungrouped vehicles", () => {
  assert.match(migration, /ADD COLUMN "vehicle_access_mode" "VehicleAccessMode" NOT NULL DEFAULT 'ALL'/);
  assert.match(migration, /ALTER TABLE "vehicles" ADD COLUMN "group_id" UUID;/);
  assert.doesNotMatch(migration, /^\s*(?:DROP|TRUNCATE|DELETE)\b/im);
  assert.doesNotMatch(migration, /UPDATE "vehicles"|UPDATE "auth_users"/i);
});

test("schema constructs one-or-zero group membership and separate authorization grants", () => {
  assert.match(schema, /groupId\s+String\?\s+@map\("group_id"\) @db\.Uuid/);
  assert.match(schema, /group\s+VehicleGroup\?\s+@relation\(fields: \[groupId\], references: \[id\], onDelete: SetNull\)/);
  assert.match(schema, /model AuthUserVehicleGroupGrant/);
  assert.match(schema, /model AuthUserVehicleGrant/);
  assert.match(schema, /@@id\(\[userId, groupId\]\)/);
  assert.match(schema, /@@id\(\[userId, vehicleId\]\)/);
  assert.doesNotMatch(schema, /UserNotificationVehicle[^]*authorization/i);
});

test("database constraints normalize group names and prevent dormant grants", () => {
  assert.match(migration, /GENERATED ALWAYS AS \(lower\("name"\)\) STORED/);
  assert.match(migration, /CHECK \("name" = btrim\("name"\) AND char_length\("name"\) > 0\)/);
  assert.match(migration, /CREATE UNIQUE INDEX "vehicle_groups_normalized_name_key"/);
  assert.match(migration, /vehicle access grants require USER \+ SELECTED state/);
  assert.match(migration, /ALL or ADMIN state cannot retain vehicle access grants/);
  assert.match(migration, /CHECK \("role" = 'USER' OR "vehicle_access_mode" = 'ALL'\)/);
});

test("delete actions encode the settled group semantics", () => {
  assert.match(migration, /REFERENCES "vehicle_groups"\("id"\) ON DELETE SET NULL/);
  assert.match(migration, /REFERENCES "vehicle_groups"\("id"\) ON DELETE CASCADE/);
  assert.match(migration, /REFERENCES "vehicles"\("id"\) ON DELETE CASCADE/);
});
