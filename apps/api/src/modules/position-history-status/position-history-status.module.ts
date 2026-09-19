import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { PositionHistoryHorizonModule } from "../position-history-horizon/position-history-horizon.module";
import { PositionHistoryHorizonExecutionLockModule } from "../position-history-horizon-execution/position-history-horizon-execution-lock.module";
import { PositionHistoryIngestionStatusService } from "./position-history-ingestion-status.service";
import { PositionHistoryStatusController } from "./position-history-status.controller";

@Module({
  imports: [DatabaseModule, PositionHistoryHorizonModule, PositionHistoryHorizonExecutionLockModule],
  controllers: [PositionHistoryStatusController],
  providers: [PositionHistoryIngestionStatusService],
})
export class PositionHistoryStatusModule {}
