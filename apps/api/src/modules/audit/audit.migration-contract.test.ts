import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { AuditActorType, AuditEventType, AuditTargetType } from "../../generated/prisma/enums";

const schema = readFileSync("prisma/schema.prisma", "utf8");
const migrationsRoot = "prisma/migrations";
const stage20aDirectory = `${migrationsRoot}/20260813185936_add_audit_trail_foundation`;
const stage20aMigration = readFileSync(`${stage20aDirectory}/migration.sql`, "utf8");

const existingMigrationDirectories = [
  "20260805_init_core",
  "20260806112815_alert_rule_settings",
  "20260808120000_add_alert_events",
  "20260808180000_add_alert_evaluation_observations",
  "20260808220000_add_alert_notification_outbox",
  "20260808230000_add_alert_notification_dispatcher_state",
  "20260810120000_add_vehicle_position_observations",
  "20260810150000_add_position_backfill_checkpoints",
  "20260812120000_add_auth_foundation",
  "20260813120000_add_position_history_population_runs",
];

test("audit foundation migration remains intact and additive settings migration is present", () => {
  const directories = readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  assert.deepEqual(directories.sort(), [...existingMigrationDirectories, "20260813185936_add_audit_trail_foundation", "20260827000000_global_business_settings"].sort());

  for (const directory of existingMigrationDirectories) {
    const files = readdirSync(`${migrationsRoot}/${directory}`);
    assert.deepEqual(files, ["migration.sql"]);
  }
  assert.deepEqual(readdirSync(stage20aDirectory), ["migration.sql"]);
});

test("Stage 20A migration declares the exact approved audit enums", () => {
  assert.deepEqual(Object.values(AuditEventType), [
    "USER_CREATED",
    "USER_ACCESS_CHANGED",
    "USER_DISABLED",
    "USER_ENABLED",
    "USER_PASSWORD_RESET",
    "OWN_PASSWORD_CHANGED",
    "SHORT_POPULATION_EXECUTED",
    "DURABLE_POPULATION_CREATED",
    "RETENTION_EXECUTED",
    "SYSTEM_POPULATION_CREATED",
  "AUTOMATIC_RETENTION_EXECUTED",
    "SETTINGS_UPDATED",
  ]);
  assert.deepEqual(Object.values(AuditActorType), ["USER", "SYSTEM"]);
  assert.deepEqual(Object.values(AuditTargetType), [
    "USER",
    "POSITION_HISTORY",
    "POSITION_HISTORY_POPULATION_RUN",
    "POSITION_HISTORY_RETENTION",
    "APPLICATION_SETTINGS",
  ]);

  assert.match(stage20aMigration, /CREATE TYPE "AuditEventType" AS ENUM \('USER_CREATED', 'USER_ACCESS_CHANGED', 'USER_DISABLED', 'USER_ENABLED', 'USER_PASSWORD_RESET', 'OWN_PASSWORD_CHANGED', 'SHORT_POPULATION_EXECUTED', 'DURABLE_POPULATION_CREATED', 'RETENTION_EXECUTED', 'SYSTEM_POPULATION_CREATED', 'AUTOMATIC_RETENTION_EXECUTED'\);/);
  assert.match(stage20aMigration, /CREATE TYPE "AuditActorType" AS ENUM \('USER', 'SYSTEM'\);/);
  assert.match(stage20aMigration, /CREATE TYPE "AuditTargetType" AS ENUM \('USER', 'POSITION_HISTORY', 'POSITION_HISTORY_POPULATION_RUN', 'POSITION_HISTORY_RETENTION'\);/);
});

test("Stage 20A migration and schema expose the exact bounded AuditEvent table shape", () => {
  assert.match(stage20aMigration, /CREATE TABLE "audit_events"/);
  assert.match(stage20aMigration, /"id" UUID NOT NULL/);
  assert.match(stage20aMigration, /"event_type" "AuditEventType" NOT NULL/);
  assert.match(stage20aMigration, /"actor_type" "AuditActorType" NOT NULL/);
  assert.match(stage20aMigration, /"actor_user_id" UUID/);
  assert.match(stage20aMigration, /"actor_login_snapshot" VARCHAR\(64\)/);
  assert.match(stage20aMigration, /"target_type" "AuditTargetType" NOT NULL/);
  assert.match(stage20aMigration, /"target_id" VARCHAR\(64\)/);
  assert.match(stage20aMigration, /"details" JSONB NOT NULL/);
  assert.match(stage20aMigration, /"created_at" TIMESTAMPTZ\(6\) NOT NULL DEFAULT CURRENT_TIMESTAMP/);

  assert.match(schema, /actorLoginSnapshot\s+String\?\s+@map\("actor_login_snapshot"\) @db\.VarChar\(64\)/);
  assert.match(schema, /targetId\s+String\?\s+@map\("target_id"\) @db\.VarChar\(64\)/);
  assert.match(schema, /details\s+Json\s+@map\("details"\) @db\.JsonB/);
  assert.match(schema, /createdAt\s+DateTime\s+@default\(now\(\)\) @map\("created_at"\) @db\.Timestamptz\(6\)/);
  assert.match(schema, /onDelete: SetNull/);
});

test("Stage 20A migration enforces SET NULL actor FK and append-only JSON/identity constraints", () => {
  assert.match(stage20aMigration, /REFERENCES "auth_users"\("id"\) ON DELETE SET NULL ON UPDATE CASCADE/);
  assert.match(stage20aMigration, /CHECK \(jsonb_typeof\("details"\) = 'object'\)/);
  assert.match(stage20aMigration, /CHECK \("actor_type" <> 'SYSTEM' OR \("actor_user_id" IS NULL AND "actor_login_snapshot" IS NULL\)\)/);
  assert.match(stage20aMigration, /CHECK \("actor_type" <> 'USER' OR \("actor_login_snapshot" IS NOT NULL AND char_length\("actor_login_snapshot"\) > 0\)\)/);
  assert.match(stage20aMigration, /CHECK \("actor_user_id" IS NULL OR "actor_type" = 'USER'\)/);
  assert.match(stage20aMigration, /CHECK \("target_id" IS NULL OR char_length\("target_id"\) > 0\)/);
  assert.match(stage20aMigration, /CHECK \(isfinite\("created_at"\)\)/);
});

test("Stage 20A migration contains only the three requested audit indexes in column order", () => {
  const indexNames = [...stage20aMigration.matchAll(/CREATE (?:UNIQUE )?INDEX "([^"]+)" ON "audit_events"/g)].map((match) => match[1]);
  assert.deepEqual(indexNames, [
    "audit_events_created_at_id_idx",
    "audit_events_event_type_created_at_idx",
    "audit_events_actor_user_id_created_at_idx",
  ]);

  assert.match(stage20aMigration, /CREATE INDEX "audit_events_created_at_id_idx" ON "audit_events"\("created_at", "id"\);/);
  assert.match(stage20aMigration, /CREATE INDEX "audit_events_event_type_created_at_idx" ON "audit_events"\("event_type", "created_at"\);/);
  assert.match(stage20aMigration, /CREATE INDEX "audit_events_actor_user_id_created_at_idx" ON "audit_events"\("actor_user_id", "created_at"\);/);

  assert.doesNotMatch(stage20aMigration, /USING (?:GIN|GIST|BRIN|HASH)/i);
  assert.doesNotMatch(stage20aMigration, /jsonb_path_ops|to_tsvector|CREATE (?:UNIQUE )?INDEX[^;]*"details"/i);
});

test("Stage 20A migration introduces no unrelated schema objects or destructive statements", () => {
  assert.equal((stage20aMigration.match(/CREATE TYPE /g) ?? []).length, 3);
  assert.equal((stage20aMigration.match(/CREATE TABLE /g) ?? []).length, 1);
  assert.equal((stage20aMigration.match(/CREATE (?:UNIQUE )?INDEX /g) ?? []).length, 3);
  assert.equal((stage20aMigration.match(/ALTER TABLE "audit_events"/g) ?? []).length, 7);
  assert.doesNotMatch(stage20aMigration, /CREATE (?:OR REPLACE )?(?:FUNCTION|PROCEDURE|TRIGGER|VIEW|MATERIALIZED VIEW|SEQUENCE|EXTENSION)/i);
  assert.doesNotMatch(stage20aMigration, /^\s*(?:DROP|TRUNCATE|DELETE)\b/im);
  assert.doesNotMatch(stage20aMigration, /auth_user_permissions|auth_sessions|position_history_population_runs/i);
});
