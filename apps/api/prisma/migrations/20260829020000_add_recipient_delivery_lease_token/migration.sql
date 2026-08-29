-- Lease token makes stale-worker completion impossible after a delivery is reclaimed.
ALTER TABLE "alert_notification_deliveries" ADD COLUMN "lease_token" UUID;
