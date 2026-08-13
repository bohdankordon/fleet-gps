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
import { AlertEventsModule } from "./modules/alert-events/alert-events.module";
import { AlertEvaluationModule } from "./modules/alert-evaluation/alert-evaluation.module";
import { AlertNotificationsModule } from "./modules/alert-notifications/alert-notifications.module";
import { AlertNotificationSchedulerModule } from "./modules/alert-notification-scheduler/alert-notification-scheduler.module";
import { FleetMapModule } from "./modules/fleet-map";
import { VehicleDetailsModule } from "./modules/vehicle-details";
import { VehicleTrackModule } from "./modules/vehicle-track";
import { TripStopAnalyticsModule } from "./modules/trip-stop-analytics";
import { FleetActivityReportModule } from "./modules/fleet-activity-report";
import { PositionHistoryStatusModule } from "./modules/position-history-status";
import { AuthModule } from "./modules/auth/auth.module";
import { PositionHistoryHorizonExecutionModule } from "./modules/position-history-horizon-execution";
import { PositionHistoryPopulationRunModule } from "./modules/position-history-population-runs";

@Module({
  imports: [ApiConfigModule, AuthModule, EquGpsModule, DatabaseModule, HealthModule, FleetModule, FleetMapModule, VehicleDetailsModule, VehicleTrackModule, TripStopAnalyticsModule, FleetActivityReportModule, PositionHistoryStatusModule, PositionHistoryHorizonExecutionModule, PositionHistoryPopulationRunModule, DashboardModule, SyncSchedulerModule, AlertSettingsModule, CityGeofenceModule, SpeedingDetectorModule, InactivityDetectorModule, AlertEventsModule, AlertEvaluationModule, AlertNotificationsModule, AlertNotificationSchedulerModule],
})
export class AppModule {}
