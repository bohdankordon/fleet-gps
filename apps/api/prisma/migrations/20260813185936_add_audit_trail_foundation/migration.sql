-- CreateEnum
CREATE TYPE "AuditEventType" AS ENUM ('USER_CREATED', 'USER_ACCESS_CHANGED', 'USER_DISABLED', 'USER_ENABLED', 'USER_PASSWORD_RESET', 'OWN_PASSWORD_CHANGED', 'SHORT_POPULATION_EXECUTED', 'DURABLE_POPULATION_CREATED', 'RETENTION_EXECUTED', 'SYSTEM_POPULATION_CREATED', 'AUTOMATIC_RETENTION_EXECUTED');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('USER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AuditTargetType" AS ENUM ('USER', 'POSITION_HISTORY', 'POSITION_HISTORY_POPULATION_RUN', 'POSITION_HISTORY_RETENTION');

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "event_type" "AuditEventType" NOT NULL,
    "actor_type" "AuditActorType" NOT NULL,
    "actor_user_id" UUID,
    "actor_login_snapshot" VARCHAR(64),
    "target_type" "AuditTargetType" NOT NULL,
    "target_id" VARCHAR(64),
    "details" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_events_created_at_id_idx" ON "audit_events"("created_at", "id");

-- CreateIndex
CREATE INDEX "audit_events_event_type_created_at_idx" ON "audit_events"("event_type", "created_at");

-- CreateIndex
CREATE INDEX "audit_events_actor_user_id_created_at_idx" ON "audit_events"("actor_user_id", "created_at");

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "auth_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Append-only administrative/security audit constraints.
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_details_json_object"
CHECK (jsonb_typeof("details") = 'object');

ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_system_actor_has_no_identity"
CHECK ("actor_type" <> 'SYSTEM' OR ("actor_user_id" IS NULL AND "actor_login_snapshot" IS NULL));

ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_user_actor_has_login_snapshot"
CHECK ("actor_type" <> 'USER' OR ("actor_login_snapshot" IS NOT NULL AND char_length("actor_login_snapshot") > 0));

ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_matches_user_actor"
CHECK ("actor_user_id" IS NULL OR "actor_type" = 'USER');

ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_target_id_nonempty"
CHECK ("target_id" IS NULL OR char_length("target_id") > 0);

ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_created_at_finite"
CHECK (isfinite("created_at"));
