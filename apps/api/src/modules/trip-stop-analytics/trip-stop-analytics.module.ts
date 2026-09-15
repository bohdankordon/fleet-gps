import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { VehicleAccessModule } from "../vehicle-access/vehicle-access.module";
import { PrismaTripStopAnalyticsRepository } from "./prisma-trip-stop-analytics.repository";
import { TripStopAnalyticsService } from "./trip-stop-analytics.service";
import { TripStopAnalyticsPolicyService } from "./trip-stop-analytics-policy.service";
import { TRIP_STOP_ANALYTICS_REPOSITORY } from "./trip-stop-analytics.tokens";
import { TripStopAnalysisController } from "./trip-stop-analysis.controller";

@Module({
  imports: [DatabaseModule, VehicleAccessModule],
  controllers: [TripStopAnalysisController],
  providers: [
    { provide: TRIP_STOP_ANALYTICS_REPOSITORY, useExisting: PrismaTripStopAnalyticsRepository },
    PrismaTripStopAnalyticsRepository,
    TripStopAnalyticsPolicyService,
    TripStopAnalyticsService,
  ],
  exports: [TripStopAnalyticsService, TripStopAnalyticsPolicyService],
})
export class TripStopAnalyticsModule {}
