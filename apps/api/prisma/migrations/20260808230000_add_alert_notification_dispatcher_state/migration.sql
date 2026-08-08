-- Expand the durable notification intent into a leased delivery state machine.
-- No existing AlertEvent rows are changed or backfilled.
ALTER TYPE "AlertNotificationStatus" ADD VALUE 'SENDING';
ALTER TYPE "AlertNotificationStatus" ADD VALUE 'FAILED';

ALTER TABLE "alert_notification_outbox"
ADD COLUMN "available_at" TIMESTAMPTZ(6),
ADD COLUMN "locked_at" TIMESTAMPTZ(6),
ADD COLUMN "lock_token" UUID,
ADD COLUMN "last_error_code" VARCHAR(32);

-- Existing PENDING and SENT intents remain valid. Using created_at preserves
-- their original ordering while avoiding a table rewrite with a volatile default.
UPDATE "alert_notification_outbox"
SET "available_at" = "created_at"
WHERE "available_at" IS NULL;

ALTER TABLE "alert_notification_outbox"
ALTER COLUMN "available_at" SET DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "available_at" SET NOT NULL;

ALTER TABLE "alert_notification_outbox"
DROP CONSTRAINT "alert_notification_outbox_status_consistent";

ALTER TABLE "alert_notification_outbox"
ADD CONSTRAINT "alert_notification_outbox_status_consistent" CHECK (
    (
        "status" = 'PENDING' AND
        "sent_at" IS NULL AND
        "locked_at" IS NULL AND
        "lock_token" IS NULL
    ) OR (
        "status" = 'SENDING' AND
        "sent_at" IS NULL AND
        "locked_at" IS NOT NULL AND
        "lock_token" IS NOT NULL AND
        "last_error_code" IS NULL
    ) OR (
        "status" = 'SENT' AND
        "sent_at" IS NOT NULL AND
        "locked_at" IS NULL AND
        "lock_token" IS NULL AND
        "last_error_code" IS NULL
    ) OR (
        "status" = 'FAILED' AND
        "sent_at" IS NULL AND
        "locked_at" IS NULL AND
        "lock_token" IS NULL AND
        "last_error_code" IS NOT NULL
    )
);

ALTER TABLE "alert_notification_outbox"
ADD CONSTRAINT "alert_notification_outbox_timestamps_finite" CHECK (
    isfinite("created_at") AND
    isfinite("available_at") AND
    ("locked_at" IS NULL OR isfinite("locked_at")) AND
    ("sent_at" IS NULL OR isfinite("sent_at")) AND
    ("last_attempt_at" IS NULL OR isfinite("last_attempt_at"))
);

DROP INDEX "alert_notification_outbox_status_created_at_id_idx";

CREATE INDEX "alert_notification_outbox_status_available_at_created_at_id_idx"
ON "alert_notification_outbox"("status", "available_at", "created_at", "id");
