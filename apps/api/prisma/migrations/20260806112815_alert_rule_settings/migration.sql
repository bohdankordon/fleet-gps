-- AlterTable
ALTER TABLE "application_settings" ADD COLUMN     "city_geofence_geo_json" JSONB,
ADD COLUMN     "inactivity_distance_meters" INTEGER NOT NULL DEFAULT 300,
ADD COLUMN     "inactivity_duration_minutes" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "inactivity_rule_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "speed_rule_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "speeding_confirmation_updates" INTEGER NOT NULL DEFAULT 2;
