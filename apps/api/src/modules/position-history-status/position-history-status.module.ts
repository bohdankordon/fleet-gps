import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { PositionHistoryHorizonModule } from "../position-history-horizon/position-history-horizon.module";
import { PositionHistoryStatusController } from "./position-history-status.controller";
import { PositionHistoryStatusService } from "./position-history-status.service";
import { POSITION_HISTORY_STATUS_OBSERVATION_REPOSITORY } from "./position-history-status.tokens";
import { PrismaPositionHistoryStatusObservationRepository } from "./prisma-position-history-status-observation.repository";

@Module({
  imports: [DatabaseModule, PositionHistoryHorizonModule],
  controllers: [PositionHistoryStatusController],
  providers: [
    { provide: POSITION_HISTORY_STATUS_OBSERVATION_REPOSITORY, useExisting: PrismaPositionHistoryStatusObservationRepository },
    PrismaPositionHistoryStatusObservationRepository,
    PositionHistoryStatusService,
  ],
})
export class PositionHistoryStatusModule {}
