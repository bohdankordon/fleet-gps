import { Module } from "@nestjs/common";
import { ApiConfigModule } from "./config/api-config.module";
import { EquGpsModule } from "./modules/equgps/equgps.module";
import { DatabaseModule } from "./modules/database/database.module";
import { HealthModule } from "./modules/health/health.module";
import { FleetModule } from "./modules/fleet/fleet.module";
import { DashboardModule } from "./modules/dashboard/dashboard.module";
import { SyncSchedulerModule } from "./modules/sync-scheduler/sync-scheduler.module";
import { AlertSettingsModule } from "./modules/alert-settings/alert-settings.module";
import { CityGeofenceModule } from "./modules/city-geofence/city-geofence.module";
import { SpeedingDetectorModule } from "./modules/speeding-detector/speeding-detector.module";
import { InactivityDetectorModule } from "./modules/inactivity-detector/inactivity-detector.module";

@Module({
  imports: [ApiConfigModule, EquGpsModule, DatabaseModule, HealthModule, FleetModule, DashboardModule, SyncSchedulerModule, AlertSettingsModule, CityGeofenceModule, SpeedingDetectorModule, InactivityDetectorModule],
})
export class AppModule {}
