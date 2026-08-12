import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { POSITION_HISTORY_COVERAGE_REPOSITORY } from "./position-history-coverage.tokens";
import { PositionHistoryCoverageService } from "./position-history-coverage.service";
import { PrismaPositionHistoryCoverageRepository } from "./prisma-position-history-coverage.repository";

@Module({
  imports: [DatabaseModule],
  providers: [
    { provide: POSITION_HISTORY_COVERAGE_REPOSITORY, useExisting: PrismaPositionHistoryCoverageRepository },
    PrismaPositionHistoryCoverageRepository,
    PositionHistoryCoverageService,
  ],
  exports: [PositionHistoryCoverageService],
})
export class PositionHistoryCoverageModule {}
