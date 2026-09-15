import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { VehicleAccessModule } from "../vehicle-access/vehicle-access.module";
import { FleetActivityReportController } from "./fleet-activity-report.controller";
import { FleetActivityReportService } from "./fleet-activity-report.service";
import { FLEET_ACTIVITY_REPORT_REPOSITORY } from "./fleet-activity-report.tokens";
import { PrismaFleetActivityReportRepository } from "./prisma-fleet-activity-report.repository";
import { TripStopAnalyticsModule } from "../trip-stop-analytics";

@Module({ imports: [DatabaseModule, TripStopAnalyticsModule, VehicleAccessModule], controllers: [FleetActivityReportController], providers: [{ provide: FLEET_ACTIVITY_REPORT_REPOSITORY, useExisting: PrismaFleetActivityReportRepository }, PrismaFleetActivityReportRepository, FleetActivityReportService] })
export class FleetActivityReportModule {}
