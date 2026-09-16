-- Durable evidence belongs to the exact confirmation receipt that proved one
-- speeding streak. Legacy and INACTIVITY confirmations intentionally remain NULL.
ALTER TABLE "alert_event_confirmations"
ADD COLUMN "speeding_streak_started_at" TIMESTAMPTZ(6),
ADD COLUMN "speeding_streak_start_latitude" DOUBLE PRECISION,
ADD COLUMN "speeding_streak_start_longitude" DOUBLE PRECISION,
ADD COLUMN "last_speeding_observed_at" TIMESTAMPTZ(6),
ADD COLUMN "last_speeding_latitude" DOUBLE PRECISION,
ADD COLUMN "last_speeding_longitude" DOUBLE PRECISION;

ALTER TABLE "alert_event_confirmations"
ADD CONSTRAINT "alert_event_confirmations_speeding_evidence_complete"
CHECK (
  (
    "speeding_streak_started_at" IS NULL AND
    "speeding_streak_start_latitude" IS NULL AND
    "speeding_streak_start_longitude" IS NULL AND
    "last_speeding_observed_at" IS NULL AND
    "last_speeding_latitude" IS NULL AND
    "last_speeding_longitude" IS NULL
  ) OR (
    "speeding_streak_started_at" IS NOT NULL AND
    "speeding_streak_start_latitude" IS NOT NULL AND
    "speeding_streak_start_longitude" IS NOT NULL AND
    "last_speeding_observed_at" IS NOT NULL AND
    "last_speeding_latitude" IS NOT NULL AND
    "last_speeding_longitude" IS NOT NULL
  )
);

ALTER TABLE "alert_event_confirmations"
ADD CONSTRAINT "alert_event_confirmations_speeding_latitudes_valid"
CHECK (
  "speeding_streak_start_latitude" IS NULL OR (
    "speeding_streak_start_latitude" BETWEEN -90 AND 90 AND
    "speeding_streak_start_latitude" > '-Infinity'::DOUBLE PRECISION AND
    "speeding_streak_start_latitude" < 'Infinity'::DOUBLE PRECISION AND
    "last_speeding_latitude" BETWEEN -90 AND 90 AND
    "last_speeding_latitude" > '-Infinity'::DOUBLE PRECISION AND
    "last_speeding_latitude" < 'Infinity'::DOUBLE PRECISION
  )
);

ALTER TABLE "alert_event_confirmations"
ADD CONSTRAINT "alert_event_confirmations_speeding_longitudes_valid"
CHECK (
  "speeding_streak_start_longitude" IS NULL OR (
    "speeding_streak_start_longitude" BETWEEN -180 AND 180 AND
    "speeding_streak_start_longitude" > '-Infinity'::DOUBLE PRECISION AND
    "speeding_streak_start_longitude" < 'Infinity'::DOUBLE PRECISION AND
    "last_speeding_longitude" BETWEEN -180 AND 180 AND
    "last_speeding_longitude" > '-Infinity'::DOUBLE PRECISION AND
    "last_speeding_longitude" < 'Infinity'::DOUBLE PRECISION
  )
);

ALTER TABLE "alert_event_confirmations"
ADD CONSTRAINT "alert_event_confirmations_speeding_time_order"
CHECK (
  "speeding_streak_started_at" IS NULL OR (
    isfinite("speeding_streak_started_at") AND
    isfinite("observed_at") AND
    isfinite("last_speeding_observed_at") AND
    "speeding_streak_started_at" <= "observed_at" AND
    "observed_at" <= "last_speeding_observed_at"
  )
);

-- One restorable speeding state per vehicle. No rows are backfilled: an absent
-- checkpoint means an empty streak at the trusted processed journal frontier.
CREATE TABLE "speeding_detector_checkpoints" (
  "vehicle_id" UUID NOT NULL,
  "last_accepted_observed_at" TIMESTAMPTZ(6) NOT NULL,
  "settings_fingerprint" VARCHAR(64) NOT NULL,
  "context_zone" "AlertEventSpeedZone",
  "context_threshold_kph" DOUBLE PRECISION,
  "context_confirmation_required" INTEGER,
  "consecutive_count" INTEGER NOT NULL,
  "confirmed" BOOLEAN NOT NULL,
  "streak_started_at" TIMESTAMPTZ(6),
  "streak_start_latitude" DOUBLE PRECISION,
  "streak_start_longitude" DOUBLE PRECISION,
  "confirmation_observed_at" TIMESTAMPTZ(6),
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "speeding_detector_checkpoints_pkey" PRIMARY KEY ("vehicle_id")
);

ALTER TABLE "speeding_detector_checkpoints"
ADD CONSTRAINT "speeding_detector_checkpoints_vehicle_id_fkey"
FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "speeding_detector_checkpoints"
ADD CONSTRAINT "speeding_detector_checkpoints_fingerprint_sha256"
CHECK ("settings_fingerprint" ~ '^[0-9a-f]{64}$');

ALTER TABLE "speeding_detector_checkpoints"
ADD CONSTRAINT "speeding_detector_checkpoints_context_complete"
CHECK (
  ("context_zone" IS NULL AND "context_threshold_kph" IS NULL AND "context_confirmation_required" IS NULL) OR
  ("context_zone" IS NOT NULL AND "context_threshold_kph" IS NOT NULL AND "context_confirmation_required" IS NOT NULL)
);

ALTER TABLE "speeding_detector_checkpoints"
ADD CONSTRAINT "speeding_detector_checkpoints_state_consistent"
CHECK (
  "consecutive_count" >= 0 AND
  ("confirmed" = ("confirmation_observed_at" IS NOT NULL)) AND
  (NOT "confirmed" OR "consecutive_count" >= "context_confirmation_required") AND
  ("confirmed" OR "consecutive_count" < COALESCE("context_confirmation_required", 1)) AND
  (
    ("consecutive_count" = 0 AND NOT "confirmed" AND "streak_started_at" IS NULL AND "streak_start_latitude" IS NULL AND "streak_start_longitude" IS NULL) OR
    ("consecutive_count" > 0 AND "context_zone" IS NOT NULL AND "streak_started_at" IS NOT NULL AND "streak_start_latitude" IS NOT NULL AND "streak_start_longitude" IS NOT NULL)
  )
);

ALTER TABLE "speeding_detector_checkpoints"
ADD CONSTRAINT "speeding_detector_checkpoints_context_valid"
CHECK (
  "context_zone" IS NULL OR (
    "context_threshold_kph" > 0 AND
    "context_threshold_kph" < 'Infinity'::DOUBLE PRECISION AND
    "context_confirmation_required" > 0
  )
);

ALTER TABLE "speeding_detector_checkpoints"
ADD CONSTRAINT "speeding_detector_checkpoints_coordinates_valid"
CHECK (
  "streak_start_latitude" IS NULL OR (
    "streak_start_latitude" BETWEEN -90 AND 90 AND
    "streak_start_latitude" > '-Infinity'::DOUBLE PRECISION AND
    "streak_start_latitude" < 'Infinity'::DOUBLE PRECISION AND
    "streak_start_longitude" BETWEEN -180 AND 180 AND
    "streak_start_longitude" > '-Infinity'::DOUBLE PRECISION AND
    "streak_start_longitude" < 'Infinity'::DOUBLE PRECISION
  )
);

ALTER TABLE "speeding_detector_checkpoints"
ADD CONSTRAINT "speeding_detector_checkpoints_time_order"
CHECK (
  isfinite("last_accepted_observed_at") AND
  isfinite("updated_at") AND
  ("streak_started_at" IS NULL OR (
    isfinite("streak_started_at") AND
    "streak_started_at" <= "last_accepted_observed_at"
  )) AND
  ("confirmation_observed_at" IS NULL OR (
    isfinite("confirmation_observed_at") AND
    "streak_started_at" <= "confirmation_observed_at" AND
    "confirmation_observed_at" <= "last_accepted_observed_at"
  ))
);
