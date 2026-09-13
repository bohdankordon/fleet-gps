CREATE TYPE "PositionHistoryReplayKind" AS ENUM ('DAILY_7_DAY', 'ROLLING_90_DAY');
CREATE TYPE "PositionHistoryReplayRunStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED');

CREATE TABLE "position_history_replay_runs" (
    "id" UUID NOT NULL,
    "kind" "PositionHistoryReplayKind" NOT NULL,
    "generation_anchor" TIMESTAMPTZ(6) NOT NULL,
    "range_from" TIMESTAMPTZ(6) NOT NULL,
    "range_to" TIMESTAMPTZ(6) NOT NULL,
    "status" "PositionHistoryReplayRunStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "lease_owner" UUID,
    "lease_expires_at" TIMESTAMPTZ(6),

    CONSTRAINT "position_history_replay_runs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "position_history_replay_runs_range_valid" CHECK (
        isfinite("generation_anchor")
        AND isfinite("range_from")
        AND isfinite("range_to")
        AND isfinite("created_at")
        AND isfinite("updated_at")
        AND ("started_at" IS NULL OR isfinite("started_at"))
        AND ("completed_at" IS NULL OR isfinite("completed_at"))
        AND ("lease_expires_at" IS NULL OR isfinite("lease_expires_at"))
        AND "range_from" < "range_to"
    ),
    CONSTRAINT "position_history_replay_runs_lease_consistent" CHECK (
        ("lease_owner" IS NULL) = ("lease_expires_at" IS NULL)
    ),
    CONSTRAINT "position_history_replay_runs_lifecycle_valid" CHECK (
        ("status" = 'PENDING' AND "lease_owner" IS NULL AND "completed_at" IS NULL)
        OR ("status" = 'RUNNING' AND "lease_owner" IS NOT NULL AND "completed_at" IS NULL)
        OR ("status" = 'COMPLETED' AND "lease_owner" IS NULL AND "completed_at" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "position_history_replay_runs_generation_key"
ON "position_history_replay_runs"("kind", "generation_anchor");

CREATE INDEX "position_history_replay_runs_claim_idx"
ON "position_history_replay_runs"("status", "lease_expires_at", "created_at");

CREATE TABLE "position_history_replay_checkpoints" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "range_from" TIMESTAMPTZ(6) NOT NULL,
    "range_to" TIMESTAMPTZ(6) NOT NULL,
    "next_from" TIMESTAMPTZ(6) NOT NULL,
    "status" "PositionBackfillStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "position_history_replay_checkpoints_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "position_history_replay_checkpoints_progress_valid" CHECK (
        isfinite("range_from")
        AND isfinite("range_to")
        AND isfinite("next_from")
        AND isfinite("created_at")
        AND isfinite("updated_at")
        AND "range_from" < "range_to"
        AND "range_from" <= "next_from"
        AND "next_from" <= "range_to"
        AND (("status" = 'COMPLETED') = ("next_from" = "range_to"))
    )
);

CREATE UNIQUE INDEX "position_history_replay_checkpoints_target_key"
ON "position_history_replay_checkpoints"("run_id", "vehicle_id", "range_from", "range_to");

CREATE INDEX "position_history_replay_checkpoints_work_idx"
ON "position_history_replay_checkpoints"("run_id", "status", "range_from", "vehicle_id");

CREATE INDEX "position_history_replay_checkpoints_vehicle_id_idx"
ON "position_history_replay_checkpoints"("vehicle_id");

ALTER TABLE "position_history_replay_checkpoints"
ADD CONSTRAINT "position_history_replay_checkpoints_run_id_fkey"
FOREIGN KEY ("run_id") REFERENCES "position_history_replay_runs"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "position_history_replay_checkpoints"
ADD CONSTRAINT "position_history_replay_checkpoints_vehicle_id_fkey"
FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
