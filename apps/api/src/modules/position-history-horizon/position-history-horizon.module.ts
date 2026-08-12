import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { PositionHistoryHorizonService } from "./position-history-horizon.service";
import { POSITION_HISTORY_HORIZON_REPOSITORY } from "./position-history-horizon.tokens";
import { PrismaPositionHistoryHorizonRepository } from "./prisma-position-history-horizon.repository";

@Module({
  imports: [DatabaseModule],
  providers: [
    { provide: POSITION_HISTORY_HORIZON_REPOSITORY, useExisting: PrismaPositionHistoryHorizonRepository },
    PrismaPositionHistoryHorizonRepository,
    PositionHistoryHorizonService,
  ],
  exports: [PositionHistoryHorizonService],
})
export class PositionHistoryHorizonModule {}
