-- Persist the exact normalized observation that confirmed a SPEEDING event.
-- Nullable by design: legacy events without an exact journal identity remain valid.
ALTER TABLE "alert_events"
ADD COLUMN "confirmation_latitude" DOUBLE PRECISION,
ADD COLUMN "confirmation_longitude" DOUBLE PRECISION;

-- Backfill only from the journal's unique exact vehicle/timestamp identity.
-- There is deliberately no tolerance, nearest-point lookup, provider data, or generated coordinate.
UPDATE "alert_events" AS event
SET
  "confirmation_latitude" = evidence."latitude",
  "confirmation_longitude" = evidence."longitude"
FROM "alert_evaluation_observations" AS evidence
WHERE event."type" = 'SPEEDING'
  AND evidence."vehicle_id" = event."vehicle_id"
  AND evidence."observed_at" = event."confirmed_at";

ALTER TABLE "alert_events"
ADD CONSTRAINT "alert_events_confirmation_position_pair"
CHECK (("confirmation_latitude" IS NULL) = ("confirmation_longitude" IS NULL));

ALTER TABLE "alert_events"
ADD CONSTRAINT "alert_events_confirmation_latitude_valid"
CHECK (
  "confirmation_latitude" IS NULL OR (
    "confirmation_latitude" BETWEEN -90 AND 90 AND
    "confirmation_latitude" > '-Infinity'::DOUBLE PRECISION AND
    "confirmation_latitude" < 'Infinity'::DOUBLE PRECISION
  )
);

ALTER TABLE "alert_events"
ADD CONSTRAINT "alert_events_confirmation_longitude_valid"
CHECK (
  "confirmation_longitude" IS NULL OR (
    "confirmation_longitude" BETWEEN -180 AND 180 AND
    "confirmation_longitude" > '-Infinity'::DOUBLE PRECISION AND
    "confirmation_longitude" < 'Infinity'::DOUBLE PRECISION
  )
);

ALTER TABLE "alert_events"
ADD CONSTRAINT "alert_events_confirmation_position_speeding_only"
CHECK ("type" = 'SPEEDING' OR "confirmation_latitude" IS NULL);
