import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { PositionHistoryHistoricalWindowModule } from "../position-history-historical-window";
import { PositionHistoryBackfillService } from "./position-history-backfill.service";
import { PositionHistoryFleetBackfillService } from "./position-history-fleet-backfill.service";
import { POSITION_HISTORY_BACKFILL_REPOSITORY, POSITION_HISTORY_FLEET_BACKFILL_REPOSITORY } from "./position-history-backfill.tokens";
import { PrismaPositionHistoryFleetBackfillRepository } from "./prisma-position-history-fleet-backfill.repository";
import { PrismaPositionHistoryBackfillRepository } from "./prisma-position-history-backfill.repository";

@Module({
  imports: [DatabaseModule, PositionHistoryHistoricalWindowModule],
  providers: [
    { provide: POSITION_HISTORY_BACKFILL_REPOSITORY, useExisting: PrismaPositionHistoryBackfillRepository },
    { provide: POSITION_HISTORY_FLEET_BACKFILL_REPOSITORY, useExisting: PrismaPositionHistoryFleetBackfillRepository },
    PrismaPositionHistoryBackfillRepository,
    PrismaPositionHistoryFleetBackfillRepository,
    PositionHistoryBackfillService,
    PositionHistoryFleetBackfillService,
  ],
  exports: [PositionHistoryBackfillService, PositionHistoryFleetBackfillService],
})
export class PositionHistoryBackfillModule {}
