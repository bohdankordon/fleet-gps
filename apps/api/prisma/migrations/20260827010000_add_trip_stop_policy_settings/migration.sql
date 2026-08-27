-- Global, typed trip/stop analytical policy. Defaults preserve the established interpretation.
ALTER TABLE "application_settings"
  ADD COLUMN "trip_movement_speed_kph" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN "trip_movement_confirmation_seconds" INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN "trip_stop_confirmation_seconds" INTEGER NOT NULL DEFAULT 300,
  ADD COLUMN "trip_data_gap_seconds" INTEGER NOT NULL DEFAULT 300,
  ADD CONSTRAINT "application_settings_trip_movement_speed_range" CHECK ("trip_movement_speed_kph" BETWEEN 1 AND 200),
  ADD CONSTRAINT "application_settings_trip_movement_confirmation_range" CHECK ("trip_movement_confirmation_seconds" BETWEEN 1 AND 604800),
  ADD CONSTRAINT "application_settings_trip_stop_confirmation_range" CHECK ("trip_stop_confirmation_seconds" BETWEEN 1 AND 604800),
  ADD CONSTRAINT "application_settings_trip_data_gap_range" CHECK ("trip_data_gap_seconds" BETWEEN 1 AND 604800);
