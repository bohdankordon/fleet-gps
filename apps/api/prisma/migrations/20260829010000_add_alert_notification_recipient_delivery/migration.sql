-- Per-user Telegram recipient planning only. Legacy global outbox delivery is unchanged.
CREATE TYPE "AlertNotificationDeliveryStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED', 'SUPPRESSED');

CREATE TABLE "alert_notifications" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "alert_event_id" UUID NOT NULL,
  "kind" "AlertNotificationKind" NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "alert_notifications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "alert_notifications_alert_event_id_kind_key" UNIQUE ("alert_event_id", "kind"),
  CONSTRAINT "alert_notifications_alert_event_id_fkey" FOREIGN KEY ("alert_event_id") REFERENCES "alert_events"("id") ON DELETE RESTRICT
);

CREATE TABLE "alert_notification_deliveries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "notification_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "status" "AlertNotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "connection_revision" INTEGER NOT NULL,
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "next_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lease_until" TIMESTAMPTZ(6),
  "sent_at" TIMESTAMPTZ(6),
  "suppressed_at" TIMESTAMPTZ(6),
  "last_failure_code" VARCHAR(64),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "alert_notification_deliveries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "alert_notification_deliveries_notification_id_user_id_key" UNIQUE ("notification_id", "user_id"),
  CONSTRAINT "alert_notification_deliveries_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "alert_notifications"("id") ON DELETE RESTRICT,
  CONSTRAINT "alert_notification_deliveries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth_users"("id") ON DELETE RESTRICT
);

CREATE INDEX "alert_notification_deliveries_dispatch_idx" ON "alert_notification_deliveries"("status", "next_attempt_at");
CREATE INDEX "alert_notification_deliveries_lease_idx" ON "alert_notification_deliveries"("lease_until");
CREATE INDEX "alert_notification_deliveries_notification_idx" ON "alert_notification_deliveries"("notification_id");
CREATE INDEX "alert_notification_deliveries_user_idx" ON "alert_notification_deliveries"("user_id");
