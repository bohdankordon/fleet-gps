-- CreateEnum
CREATE TYPE "AlertEventType" AS ENUM ('SPEEDING', 'INACTIVITY');

-- CreateEnum
CREATE TYPE "AlertEventStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "AlertEventSpeedZone" AS ENUM ('CITY', 'OUTSIDE_CITY');

-- CreateTable
CREATE TABLE "alert_events" (
    "id" UUID NOT NULL,
    "vehicle_id" UUID NOT NULL,
    "type" "AlertEventType" NOT NULL,
    "status" "AlertEventStatus" NOT NULL,
    "confirmed_at" TIMESTAMPTZ(6) NOT NULL,
    "last_observed_at" TIMESTAMPTZ(6) NOT NULL,
    "resolved_at" TIMESTAMPTZ(6),
    "dedupe_key" VARCHAR(64) NOT NULL,
    "active_key" VARCHAR(64),
    "speed_zone" "AlertEventSpeedZone",
    "confirmation_speed_kph" DOUBLE PRECISION,
    "last_speed_kph" DOUBLE PRECISION,
    "peak_speed_kph" DOUBLE PRECISION,
    "speed_threshold_kph" DOUBLE PRECISION,
    "confirmation_traveled_distance_meters" DOUBLE PRECISION,
    "last_traveled_distance_meters" DOUBLE PRECISION,
    "minimum_traveled_distance_meters" DOUBLE PRECISION,
    "distance_threshold_meters" DOUBLE PRECISION,
    "duration_threshold_minutes" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "alert_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_event_confirmations" (
    "dedupe_key" VARCHAR(64) NOT NULL,
    "event_id" UUID NOT NULL,
    "observed_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_event_confirmations_pkey" PRIMARY KEY ("dedupe_key")
);

-- CreateIndex
CREATE UNIQUE INDEX "alert_events_dedupe_key_key" ON "alert_events"("dedupe_key");

-- CreateIndex
CREATE UNIQUE INDEX "alert_events_active_key_key" ON "alert_events"("active_key");

-- CreateIndex
CREATE INDEX "alert_events_vehicle_id_type_status_idx" ON "alert_events"("vehicle_id", "type", "status");

-- CreateIndex
CREATE INDEX "alert_events_status_confirmed_at_idx" ON "alert_events"("status", "confirmed_at");

-- CreateIndex
CREATE INDEX "alert_events_type_confirmed_at_idx" ON "alert_events"("type", "confirmed_at");

-- CreateIndex
CREATE INDEX "alert_event_confirmations_event_id_idx" ON "alert_event_confirmations"("event_id");

-- AddForeignKey
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_event_confirmations" ADD CONSTRAINT "alert_event_confirmations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "alert_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Domain integrity: keys, lifecycle timestamps, and mutually exclusive snapshots.
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_dedupe_key_sha256" CHECK ("dedupe_key" ~ '^[0-9a-f]{64}$');
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_active_key_sha256" CHECK ("active_key" IS NULL OR "active_key" ~ '^[0-9a-f]{64}$');
ALTER TABLE "alert_event_confirmations" ADD CONSTRAINT "alert_event_confirmations_dedupe_key_sha256" CHECK ("dedupe_key" ~ '^[0-9a-f]{64}$');
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_time_order" CHECK ("last_observed_at" >= "confirmed_at");
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_lifecycle_consistent" CHECK (
    ("status" = 'OPEN' AND "active_key" IS NOT NULL AND "resolved_at" IS NULL) OR
    ("status" = 'RESOLVED' AND "active_key" IS NULL AND "resolved_at" = "last_observed_at")
);
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_snapshot_matches_type" CHECK (
    (
        "type" = 'SPEEDING' AND
        "speed_zone" IS NOT NULL AND
        "confirmation_speed_kph" IS NOT NULL AND
        "last_speed_kph" IS NOT NULL AND
        "peak_speed_kph" IS NOT NULL AND
        "speed_threshold_kph" IS NOT NULL AND
        "confirmation_traveled_distance_meters" IS NULL AND
        "last_traveled_distance_meters" IS NULL AND
        "minimum_traveled_distance_meters" IS NULL AND
        "distance_threshold_meters" IS NULL AND
        "duration_threshold_minutes" IS NULL
    ) OR
    (
        "type" = 'INACTIVITY' AND
        "speed_zone" IS NULL AND
        "confirmation_speed_kph" IS NULL AND
        "last_speed_kph" IS NULL AND
        "peak_speed_kph" IS NULL AND
        "speed_threshold_kph" IS NULL AND
        "confirmation_traveled_distance_meters" IS NOT NULL AND
        "last_traveled_distance_meters" IS NOT NULL AND
        "minimum_traveled_distance_meters" IS NOT NULL AND
        "distance_threshold_meters" IS NOT NULL AND
        "duration_threshold_minutes" IS NOT NULL
    )
);
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_speed_metrics_valid" CHECK (
    "type" <> 'SPEEDING' OR (
        "confirmation_speed_kph" >= 0 AND "confirmation_speed_kph" < 'Infinity'::DOUBLE PRECISION AND
        "last_speed_kph" >= 0 AND "last_speed_kph" < 'Infinity'::DOUBLE PRECISION AND
        "peak_speed_kph" >= "confirmation_speed_kph" AND
        "peak_speed_kph" >= "last_speed_kph" AND
        "peak_speed_kph" < 'Infinity'::DOUBLE PRECISION AND
        "speed_threshold_kph" > 0 AND "speed_threshold_kph" < 'Infinity'::DOUBLE PRECISION AND
        "confirmation_speed_kph" > "speed_threshold_kph"
    )
);
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_inactivity_metrics_valid" CHECK (
    "type" <> 'INACTIVITY' OR (
        "confirmation_traveled_distance_meters" >= 0 AND "confirmation_traveled_distance_meters" < 'Infinity'::DOUBLE PRECISION AND
        "last_traveled_distance_meters" >= 0 AND "last_traveled_distance_meters" < 'Infinity'::DOUBLE PRECISION AND
        "minimum_traveled_distance_meters" >= 0 AND
        "minimum_traveled_distance_meters" <= "confirmation_traveled_distance_meters" AND
        "minimum_traveled_distance_meters" <= "last_traveled_distance_meters" AND
        "minimum_traveled_distance_meters" < 'Infinity'::DOUBLE PRECISION AND
        "distance_threshold_meters" > 0 AND "distance_threshold_meters" < 'Infinity'::DOUBLE PRECISION AND
        "confirmation_traveled_distance_meters" < "distance_threshold_meters" AND
        "duration_threshold_minutes" > 0
    )
);
