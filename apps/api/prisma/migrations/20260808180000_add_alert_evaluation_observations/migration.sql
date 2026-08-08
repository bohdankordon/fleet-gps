-- CreateTable
CREATE TABLE "alert_evaluation_observations" (
    "id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "observed_at" TIMESTAMPTZ(6) NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "speed_kph" DOUBLE PRECISION NOT NULL,
    "processed_at" TIMESTAMPTZ(6),
    "replay_eligible" BOOLEAN,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_evaluation_observations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "alert_evaluation_observations_vehicle_id_observed_at_key"
ON "alert_evaluation_observations"("vehicle_id", "observed_at");

-- CreateIndex
CREATE INDEX "alert_evaluation_observations_vehicle_id_processed_at_observed_at_idx"
ON "alert_evaluation_observations"("vehicle_id", "processed_at", "observed_at");

-- CreateIndex
CREATE INDEX "alert_evaluation_observations_vehicle_id_replay_eligible_observed_at_idx"
ON "alert_evaluation_observations"("vehicle_id", "replay_eligible", "observed_at");

-- AddForeignKey
ALTER TABLE "alert_evaluation_observations"
ADD CONSTRAINT "alert_evaluation_observations_vehicle_id_fkey"
FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Operational journal integrity. PostgreSQL DOUBLE PRECISION and TIMESTAMPTZ
-- accept special non-finite values, so they are rejected explicitly.
ALTER TABLE "alert_evaluation_observations"
ADD CONSTRAINT "alert_evaluation_observations_latitude_valid"
CHECK ("latitude" BETWEEN -90 AND 90 AND "latitude" > '-Infinity'::DOUBLE PRECISION AND "latitude" < 'Infinity'::DOUBLE PRECISION);

ALTER TABLE "alert_evaluation_observations"
ADD CONSTRAINT "alert_evaluation_observations_longitude_valid"
CHECK ("longitude" BETWEEN -180 AND 180 AND "longitude" > '-Infinity'::DOUBLE PRECISION AND "longitude" < 'Infinity'::DOUBLE PRECISION);

ALTER TABLE "alert_evaluation_observations"
ADD CONSTRAINT "alert_evaluation_observations_speed_valid"
CHECK ("speed_kph" >= 0 AND "speed_kph" < 'Infinity'::DOUBLE PRECISION);

ALTER TABLE "alert_evaluation_observations"
ADD CONSTRAINT "alert_evaluation_observations_timestamps_finite"
CHECK (isfinite("observed_at") AND isfinite("created_at") AND ("processed_at" IS NULL OR isfinite("processed_at")));

ALTER TABLE "alert_evaluation_observations"
ADD CONSTRAINT "alert_evaluation_observations_processed_after_creation"
CHECK ("processed_at" IS NULL OR "processed_at" >= "created_at");

ALTER TABLE "alert_evaluation_observations"
ADD CONSTRAINT "alert_evaluation_observations_processing_state_consistent"
CHECK (
    ("processed_at" IS NULL AND "replay_eligible" IS NULL)
    OR ("processed_at" IS NOT NULL AND "replay_eligible" IS NOT NULL)
);
