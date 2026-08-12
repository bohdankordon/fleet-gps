import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { FleetActivityReportController } from "./fleet-activity-report.controller";
import { FleetActivityReportService } from "./fleet-activity-report.service";
import { FLEET_ACTIVITY_REPORT_REPOSITORY } from "./fleet-activity-report.tokens";
import { PrismaFleetActivityReportRepository } from "./prisma-fleet-activity-report.repository";

@Module({ imports: [DatabaseModule], controllers: [FleetActivityReportController], providers: [{ provide: FLEET_ACTIVITY_REPORT_REPOSITORY, useExisting: PrismaFleetActivityReportRepository }, PrismaFleetActivityReportRepository, FleetActivityReportService] })
export class FleetActivityReportModule {}
