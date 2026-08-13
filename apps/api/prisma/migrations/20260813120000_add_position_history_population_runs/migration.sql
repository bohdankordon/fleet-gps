CREATE TYPE "PositionHistoryPopulationRunStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED');
CREATE TYPE "PositionHistoryPopulationRunInitiatorType" AS ENUM ('USER', 'SYSTEM');

CREATE TABLE "position_history_population_runs" (
    "id" UUID NOT NULL,
    "status" "PositionHistoryPopulationRunStatus" NOT NULL DEFAULT 'PENDING',
    "initiator_type" "PositionHistoryPopulationRunInitiatorType" NOT NULL,
    "requested_by_user_id" UUID,
    "to" TIMESTAMPTZ(6) NOT NULL,
    "exclude_provider_disabled" BOOLEAN NOT NULL,
    "window_budget" INTEGER NOT NULL,
    "committed_windows" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "lease_owner" UUID,
    "lease_expires_at" TIMESTAMPTZ(6),
    "safe_failure_code" VARCHAR(64),
    CONSTRAINT "position_history_population_runs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "position_history_population_runs_window_budget_positive" CHECK ("window_budget" > 0),
    CONSTRAINT "position_history_population_runs_committed_windows_nonnegative" CHECK ("committed_windows" >= 0),
    CONSTRAINT "position_history_population_runs_committed_within_budget" CHECK ("committed_windows" <= "window_budget")
);

CREATE INDEX "position_history_population_runs_requested_by_user_id_idx"
ON "position_history_population_runs"("requested_by_user_id");

CREATE INDEX "position_history_population_runs_claim_idx"
ON "position_history_population_runs"("status", "lease_expires_at", "created_at");

CREATE UNIQUE INDEX "position_history_population_runs_one_active_idx"
ON "position_history_population_runs" ((true))
WHERE "status" IN ('PENDING', 'RUNNING');

ALTER TABLE "position_history_population_runs"
ADD CONSTRAINT "position_history_population_runs_requested_by_user_id_fkey"
FOREIGN KEY ("requested_by_user_id") REFERENCES "auth_users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
