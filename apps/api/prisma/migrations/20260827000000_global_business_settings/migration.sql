-- Typed singleton revision protects administrative settings from lost updates.
ALTER TABLE "application_settings" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1;

-- Additive audit vocabulary for the singleton settings change trail.
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'SETTINGS_UPDATED';
ALTER TYPE "AuditTargetType" ADD VALUE IF NOT EXISTS 'APPLICATION_SETTINGS';

-- Core scalar policy invariants. Existing defaults satisfy all checks.
ALTER TABLE "application_settings"
  ADD CONSTRAINT "application_settings_minimum_daily_distance_nonnegative" CHECK ("minimum_daily_distance_meters" >= 0),
  ADD CONSTRAINT "application_settings_position_freshness_positive" CHECK ("position_freshness_seconds" > 0),
  ADD CONSTRAINT "application_settings_city_speed_limit_range" CHECK ("city_speed_limit_kph" BETWEEN 1 AND 200),
  ADD CONSTRAINT "application_settings_outside_speed_limit_range" CHECK ("outside_speed_limit_kph" BETWEEN 1 AND 200),
  ADD CONSTRAINT "application_settings_speed_tolerance_range" CHECK ("speed_tolerance_kph" BETWEEN 0 AND 50),
  ADD CONSTRAINT "application_settings_speed_confirmation_range" CHECK ("speeding_confirmation_updates" BETWEEN 1 AND 10),
  ADD CONSTRAINT "application_settings_inactivity_distance_range" CHECK ("inactivity_distance_meters" BETWEEN 0 AND 5000),
  ADD CONSTRAINT "application_settings_inactivity_duration_range" CHECK ("inactivity_duration_minutes" BETWEEN 1 AND 1440),
  ADD CONSTRAINT "application_settings_revision_positive" CHECK ("revision" > 0);
