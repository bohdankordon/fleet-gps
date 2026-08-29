-- Per-user notification preferences only. Delivery/fan-out remains a later stage.
CREATE TYPE "NotificationVehicleScope" AS ENUM ('ALL', 'SELECTED');

CREATE TABLE "user_notification_preferences" (
  "user_id" UUID NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "speeding_enabled" BOOLEAN NOT NULL DEFAULT true,
  "inactivity_enabled" BOOLEAN NOT NULL DEFAULT true,
  "vehicle_scope" "NotificationVehicleScope" NOT NULL DEFAULT 'ALL',
  "revision" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_notification_preferences_pkey" PRIMARY KEY ("user_id"),
  CONSTRAINT "user_notification_preferences_user_fkey" FOREIGN KEY ("user_id") REFERENCES "auth_users"("id") ON DELETE CASCADE
);

CREATE TABLE "user_notification_vehicles" (
  "user_id" UUID NOT NULL,
  "vehicle_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_notification_vehicles_pkey" PRIMARY KEY ("user_id", "vehicle_id"),
  CONSTRAINT "user_notification_vehicles_user_fkey" FOREIGN KEY ("user_id") REFERENCES "auth_users"("id") ON DELETE CASCADE,
  CONSTRAINT "user_notification_vehicles_preference_fkey" FOREIGN KEY ("user_id") REFERENCES "user_notification_preferences"("user_id") ON DELETE CASCADE,
  CONSTRAINT "user_notification_vehicles_vehicle_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE
);
CREATE INDEX "user_notification_vehicles_vehicle_idx" ON "user_notification_vehicles"("vehicle_id");
