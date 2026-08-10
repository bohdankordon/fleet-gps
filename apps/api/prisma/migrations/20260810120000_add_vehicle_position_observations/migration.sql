-- CreateEnum
CREATE TYPE "PositionIngestionSource" AS ENUM ('FLEET_SYNC', 'HISTORICAL_BACKFILL');

-- CreateTable
CREATE TABLE "vehicle_position_observations" (
    "id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "fix_fingerprint" VARCHAR(64) NOT NULL,
    "observed_at" TIMESTAMPTZ(6) NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "speed_kph" DOUBLE PRECISION,
    "valid" BOOLEAN,
    "outdated" BOOLEAN,
    "fetched_at" TIMESTAMPTZ(6) NOT NULL,
    "ingestion_source" "PositionIngestionSource" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_position_observations_pkey" PRIMARY KEY ("id")
);

-- One normalized provider fix may arrive from fleet polling and later backfill.
-- Source and fetch time are deliberately excluded from this identity.
CREATE UNIQUE INDEX "vehicle_position_observations_vehicle_id_fix_fingerprint_key"
ON "vehicle_position_observations"("vehicle_id", "fix_fingerprint");

-- Future bounded track reads use this ordered vehicle/time/fingerprint index.
CREATE INDEX "vehicle_position_observations_vehicle_time_idx"
ON "vehicle_position_observations"("vehicle_id", "observed_at", "fix_fingerprint");

-- Future retention can locate old observations without scanning every vehicle prefix.
CREATE INDEX "vehicle_position_observations_observed_at_idx"
ON "vehicle_position_observations"("observed_at");

-- AddForeignKey
ALTER TABLE "vehicle_position_observations"
ADD CONSTRAINT "vehicle_position_observations_vehicle_id_fkey"
FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- PostgreSQL DOUBLE PRECISION and TIMESTAMPTZ accept non-finite values, so
-- application normalization is backed by database constraints.
ALTER TABLE "vehicle_position_observations"
ADD CONSTRAINT "vehicle_position_observations_latitude_valid"
CHECK ("latitude" BETWEEN -90 AND 90 AND "latitude" > '-Infinity'::DOUBLE PRECISION AND "latitude" < 'Infinity'::DOUBLE PRECISION);

ALTER TABLE "vehicle_position_observations"
ADD CONSTRAINT "vehicle_position_observations_longitude_valid"
CHECK ("longitude" BETWEEN -180 AND 180 AND "longitude" > '-Infinity'::DOUBLE PRECISION AND "longitude" < 'Infinity'::DOUBLE PRECISION);

ALTER TABLE "vehicle_position_observations"
ADD CONSTRAINT "vehicle_position_observations_speed_valid"
CHECK ("speed_kph" IS NULL OR ("speed_kph" >= 0 AND "speed_kph" > '-Infinity'::DOUBLE PRECISION AND "speed_kph" < 'Infinity'::DOUBLE PRECISION));

ALTER TABLE "vehicle_position_observations"
ADD CONSTRAINT "vehicle_position_observations_timestamps_finite"
CHECK (isfinite("observed_at") AND isfinite("fetched_at") AND isfinite("created_at"));

ALTER TABLE "vehicle_position_observations"
ADD CONSTRAINT "vehicle_position_observations_fingerprint_format"
CHECK (char_length("fix_fingerprint") = 64 AND "fix_fingerprint" ~ '^[0-9a-f]{64}$');
