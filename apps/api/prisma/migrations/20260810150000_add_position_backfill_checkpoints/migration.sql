-- CreateEnum
CREATE TYPE "PositionBackfillStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED');

-- CreateTable
CREATE TABLE "vehicle_position_backfill_checkpoints" (
    "id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "range_from" TIMESTAMPTZ(6) NOT NULL,
    "range_to" TIMESTAMPTZ(6) NOT NULL,
    "next_from" TIMESTAMPTZ(6) NOT NULL,
    "status" "PositionBackfillStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "vehicle_position_backfill_checkpoints_pkey" PRIMARY KEY ("id")
);

-- A target interval has one durable, restart-safe progress cursor per vehicle.
CREATE UNIQUE INDEX "position_backfill_checkpoint_target_key"
ON "vehicle_position_backfill_checkpoints"("vehicle_id", "range_from", "range_to");

-- Supports bounded operator inspection of active/completed checkpoint state.
CREATE INDEX "position_backfill_checkpoint_status_idx"
ON "vehicle_position_backfill_checkpoints"("status", "updated_at");

-- AddForeignKey
ALTER TABLE "vehicle_position_backfill_checkpoints"
ADD CONSTRAINT "vehicle_position_backfill_checkpoints_vehicle_id_fkey"
FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Checkpoints describe one non-empty finite interval and an inclusive cursor.
ALTER TABLE "vehicle_position_backfill_checkpoints"
ADD CONSTRAINT "position_backfill_checkpoint_range_valid"
CHECK (
    isfinite("range_from")
    AND isfinite("range_to")
    AND isfinite("next_from")
    AND isfinite("created_at")
    AND isfinite("updated_at")
    AND "range_from" < "range_to"
    AND "next_from" BETWEEN "range_from" AND "range_to"
);

-- Status and cursor advance atomically with each persisted provider window.
ALTER TABLE "vehicle_position_backfill_checkpoints"
ADD CONSTRAINT "position_backfill_checkpoint_status_progress_valid"
CHECK (
    ("status" = 'PENDING' AND "next_from" = "range_from")
    OR ("status" = 'RUNNING' AND "next_from" > "range_from" AND "next_from" < "range_to")
    OR ("status" = 'COMPLETED' AND "next_from" = "range_to")
);
