import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { PositionHistoryHorizonExecutionLockModule } from "../position-history-horizon-execution/position-history-horizon-execution-lock.module";
import { PositionHistoryRetentionController } from "./position-history-retention.controller";
import { PositionHistoryRetentionService } from "./position-history-retention.service";
import { POSITION_HISTORY_RETENTION_CLOCK, POSITION_HISTORY_RETENTION_REPOSITORY } from "./position-history-retention.tokens";
import { PrismaPositionHistoryRetentionRepository } from "./prisma-position-history-retention.repository";

@Module({
  imports: [DatabaseModule, PositionHistoryHorizonExecutionLockModule],
  controllers: [PositionHistoryRetentionController],
  providers: [
    PrismaPositionHistoryRetentionRepository,
    { provide: POSITION_HISTORY_RETENTION_REPOSITORY, useExisting: PrismaPositionHistoryRetentionRepository },
    { provide: POSITION_HISTORY_RETENTION_CLOCK, useValue: Object.freeze({ now: () => new Date() }) },
    PositionHistoryRetentionService,
  ],
  exports: [PositionHistoryRetentionService],
})
export class PositionHistoryRetentionModule {}
