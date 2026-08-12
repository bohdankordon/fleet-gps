import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { PrismaTripStopAnalyticsRepository } from "./prisma-trip-stop-analytics.repository";
import { TripStopAnalyticsService } from "./trip-stop-analytics.service";
import { TRIP_STOP_ANALYTICS_REPOSITORY } from "./trip-stop-analytics.tokens";

@Module({
  imports: [DatabaseModule],
  providers: [
    { provide: TRIP_STOP_ANALYTICS_REPOSITORY, useExisting: PrismaTripStopAnalyticsRepository },
    PrismaTripStopAnalyticsRepository,
    TripStopAnalyticsService,
  ],
  exports: [TripStopAnalyticsService],
})
export class TripStopAnalyticsModule {}

