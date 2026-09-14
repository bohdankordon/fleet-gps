import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { PositionHistoryHorizonModule } from "../position-history-horizon/position-history-horizon.module";
import { PositionHistoryHorizonExecutionLockModule } from "../position-history-horizon-execution/position-history-horizon-execution-lock.module";
import { PositionHistoryIngestionStatusService } from "./position-history-ingestion-status.service";
import { PositionHistoryStatusController } from "./position-history-status.controller";
import { PositionHistoryStatusService } from "./position-history-status.service";
import { POSITION_HISTORY_STATUS_OBSERVATION_REPOSITORY } from "./position-history-status.tokens";
import { PrismaPositionHistoryStatusObservationRepository } from "./prisma-position-history-status-observation.repository";

@Module({
  imports: [DatabaseModule, PositionHistoryHorizonModule, PositionHistoryHorizonExecutionLockModule],
  controllers: [PositionHistoryStatusController],
  providers: [
    { provide: POSITION_HISTORY_STATUS_OBSERVATION_REPOSITORY, useExisting: PrismaPositionHistoryStatusObservationRepository },
    PrismaPositionHistoryStatusObservationRepository,
    PositionHistoryStatusService,
    PositionHistoryIngestionStatusService,
  ],
})
export class PositionHistoryStatusModule {}
