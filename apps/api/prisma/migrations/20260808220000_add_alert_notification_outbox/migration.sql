-- CreateEnum
CREATE TYPE "AlertNotificationKind" AS ENUM ('ALERT_CONFIRMED');

-- CreateEnum
CREATE TYPE "AlertNotificationStatus" AS ENUM ('PENDING', 'SENT');

-- CreateTable
CREATE TABLE "alert_notification_outbox" (
    "id" UUID NOT NULL,
    "alert_event_id" UUID NOT NULL,
    "kind" "AlertNotificationKind" NOT NULL,
    "status" "AlertNotificationStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(6),
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_attempt_at" TIMESTAMPTZ(6),

    CONSTRAINT "alert_notification_outbox_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "alert_notification_outbox_status_consistent" CHECK (
        ("status" = 'PENDING' AND "sent_at" IS NULL) OR
        ("status" = 'SENT' AND "sent_at" IS NOT NULL)
    ),
    CONSTRAINT "alert_notification_outbox_attempts_consistent" CHECK (
        "attempt_count" >= 0 AND (
            ("attempt_count" = 0 AND "last_attempt_at" IS NULL) OR
            ("attempt_count" > 0 AND "last_attempt_at" IS NOT NULL)
        )
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "alert_notification_outbox_alert_event_id_kind_key"
ON "alert_notification_outbox"("alert_event_id", "kind");

-- CreateIndex
CREATE INDEX "alert_notification_outbox_status_created_at_id_idx"
ON "alert_notification_outbox"("status", "created_at", "id");

-- AddForeignKey
ALTER TABLE "alert_notification_outbox"
ADD CONSTRAINT "alert_notification_outbox_alert_event_id_fkey"
FOREIGN KEY ("alert_event_id") REFERENCES "alert_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Existing AlertEvent history is intentionally not backfilled. Notification
-- intents begin with AlertEvent episodes created after this migration is applied.
