-- Generated from the initial Prisma schema with Prisma Migrate diff, then
-- augmented with explicit data-integrity constraints and singleton settings.
CREATE SCHEMA IF NOT EXISTS "public";

CREATE TYPE "VehicleStatus" AS ENUM ('ONLINE', 'OFFLINE', 'UNKNOWN');
CREATE TYPE "DailyStatSource" AS ENUM ('RUNS', 'MODE1', 'HISTORICAL_POSITIONS');
CREATE TYPE "DataQuality" AS ENUM ('EXACT', 'PROVISIONAL', 'ESTIMATED');

CREATE TABLE "vehicles" (
    "id" UUID NOT NULL,
    "external_device_id" INTEGER NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "vehicle_current_states" (
    "vehicle_id" UUID NOT NULL,
    "status" "VehicleStatus" NOT NULL DEFAULT 'UNKNOWN',
    "external_last_update_at" TIMESTAMPTZ(6),
    "fix_time" TIMESTAMPTZ(6),
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "speed_kph" DOUBLE PRECISION,
    "valid" BOOLEAN,
    "outdated" BOOLEAN,
    "fetched_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vehicle_current_states_pkey" PRIMARY KEY ("vehicle_id")
);

CREATE TABLE "daily_vehicle_stats" (
    "id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "service_date" DATE NOT NULL,
    "distance_meters" DECIMAL(14,2) NOT NULL,
    "movement_duration_seconds" INTEGER,
    "max_speed_kph" DECIMAL(8,3),
    "source" "DailyStatSource" NOT NULL,
    "quality" "DataQuality" NOT NULL,
    "is_stale" BOOLEAN NOT NULL DEFAULT false,
    "is_degraded" BOOLEAN NOT NULL DEFAULT false,
    "fetched_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "daily_vehicle_stats_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "application_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Europe/Kyiv',
    "minimum_daily_distance_meters" INTEGER NOT NULL DEFAULT 500,
    "city_speed_limit_kph" INTEGER NOT NULL DEFAULT 50,
    "outside_speed_limit_kph" INTEGER NOT NULL DEFAULT 90,
    "speed_tolerance_kph" INTEGER NOT NULL DEFAULT 10,
    "position_freshness_seconds" INTEGER NOT NULL DEFAULT 300,
    "telegram_chat_id" VARCHAR(128),
    "daily_report_minute_of_day" INTEGER NOT NULL DEFAULT 10,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "application_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vehicles_external_device_id_key" ON "vehicles"("external_device_id");
CREATE INDEX "daily_vehicle_stats_service_date_idx" ON "daily_vehicle_stats"("service_date");
CREATE INDEX "daily_vehicle_stats_source_idx" ON "daily_vehicle_stats"("source");
CREATE UNIQUE INDEX "daily_vehicle_stats_vehicle_id_service_date_key" ON "daily_vehicle_stats"("vehicle_id", "service_date");

ALTER TABLE "vehicle_current_states" ADD CONSTRAINT "vehicle_current_states_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "daily_vehicle_stats" ADD CONSTRAINT "daily_vehicle_stats_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_external_device_id_positive" CHECK ("external_device_id" > 0);
ALTER TABLE "vehicle_current_states" ADD CONSTRAINT "vehicle_current_states_latitude_range" CHECK ("latitude" IS NULL OR "latitude" BETWEEN -90 AND 90);
ALTER TABLE "vehicle_current_states" ADD CONSTRAINT "vehicle_current_states_longitude_range" CHECK ("longitude" IS NULL OR "longitude" BETWEEN -180 AND 180);
ALTER TABLE "vehicle_current_states" ADD CONSTRAINT "vehicle_current_states_coordinates_pair" CHECK (("latitude" IS NULL AND "longitude" IS NULL) OR ("latitude" IS NOT NULL AND "longitude" IS NOT NULL));
ALTER TABLE "vehicle_current_states" ADD CONSTRAINT "vehicle_current_states_speed_nonnegative" CHECK ("speed_kph" IS NULL OR "speed_kph" >= 0);
ALTER TABLE "daily_vehicle_stats" ADD CONSTRAINT "daily_vehicle_stats_distance_nonnegative" CHECK ("distance_meters" >= 0);
ALTER TABLE "daily_vehicle_stats" ADD CONSTRAINT "daily_vehicle_stats_duration_nonnegative" CHECK ("movement_duration_seconds" IS NULL OR "movement_duration_seconds" >= 0);
ALTER TABLE "daily_vehicle_stats" ADD CONSTRAINT "daily_vehicle_stats_max_speed_nonnegative" CHECK ("max_speed_kph" IS NULL OR "max_speed_kph" >= 0);
ALTER TABLE "application_settings" ADD CONSTRAINT "application_settings_singleton_id" CHECK ("id" = 1);
ALTER TABLE "application_settings" ADD CONSTRAINT "application_settings_min_distance_nonnegative" CHECK ("minimum_daily_distance_meters" >= 0);
ALTER TABLE "application_settings" ADD CONSTRAINT "application_settings_city_limit_positive" CHECK ("city_speed_limit_kph" > 0);
ALTER TABLE "application_settings" ADD CONSTRAINT "application_settings_outside_limit_positive" CHECK ("outside_speed_limit_kph" > 0);
ALTER TABLE "application_settings" ADD CONSTRAINT "application_settings_tolerance_nonnegative" CHECK ("speed_tolerance_kph" >= 0);
ALTER TABLE "application_settings" ADD CONSTRAINT "application_settings_freshness_positive" CHECK ("position_freshness_seconds" > 0);
ALTER TABLE "application_settings" ADD CONSTRAINT "application_settings_report_minute_range" CHECK ("daily_report_minute_of_day" BETWEEN 0 AND 1439);
ALTER TABLE "application_settings" ADD CONSTRAINT "application_settings_timezone_nonempty" CHECK (length(trim("timezone")) > 0);

INSERT INTO "application_settings" ("id", "timezone", "minimum_daily_distance_meters", "city_speed_limit_kph", "outside_speed_limit_kph", "speed_tolerance_kph", "position_freshness_seconds", "daily_report_minute_of_day", "created_at", "updated_at")
VALUES (1, 'Europe/Kyiv', 500, 50, 90, 10, 300, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
