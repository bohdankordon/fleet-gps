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
import { PositionHistoryMaintenanceModule, PositionHistoryPopulationRunModule } from "./modules/position-history-population-runs";
import { PositionHistoryRetentionModule } from "./modules/position-history-retention";
import { AdminSettingsModule } from "./modules/admin-settings/admin-settings.module";
import { TelegramLinkingModule } from "./modules/telegram-linking";
import { RecipientDeliverySchedulerModule } from "./modules/recipient-delivery-scheduler/recipient-delivery-scheduler.module";
import { PositionHistoryContinuousIngestionModule } from "./modules/position-history-continuous-ingestion";
import { VehicleAccessModule } from "./modules/vehicle-access";
import { VehicleGroupsModule } from "./modules/vehicle-groups";

@Module({
  imports: [ApiConfigModule, AuthModule, VehicleAccessModule, VehicleGroupsModule, AdminSettingsModule, TelegramLinkingModule, EquGpsModule, DatabaseModule, HealthModule, FleetModule, FleetMapModule, VehicleDetailsModule, VehicleTrackModule, TripStopAnalyticsModule, FleetActivityReportModule, PositionHistoryStatusModule, PositionHistoryHorizonExecutionModule, PositionHistoryPopulationRunModule, PositionHistoryMaintenanceModule, PositionHistoryRetentionModule, PositionHistoryContinuousIngestionModule, DashboardModule, SyncSchedulerModule, AlertSettingsModule, CityGeofenceModule, SpeedingDetectorModule, InactivityDetectorModule, AlertEventsModule, AlertEvaluationModule, AlertNotificationsModule, AlertNotificationSchedulerModule, RecipientDeliverySchedulerModule],
})
export class AppModule {}
