import { Module } from "@nestjs/common";
import { PositionHistoryHorizonPopulationModule } from "../position-history-horizon-population/position-history-horizon-population.module";
import { PositionHistoryHorizonExecutionController } from "./position-history-horizon-execution.controller";
import { PositionHistoryHorizonExecutionLockModule } from "./position-history-horizon-execution-lock.module";
import { PositionHistoryHorizonExecutionService } from "./position-history-horizon-execution.service";
import { PositionHistoryHorizonExecutionRunnerService } from "./position-history-horizon-execution-runner.service";

@Module({
  imports: [PositionHistoryHorizonExecutionLockModule, PositionHistoryHorizonPopulationModule],
  controllers: [PositionHistoryHorizonExecutionController],
  providers: [
    PositionHistoryHorizonExecutionRunnerService,
    PositionHistoryHorizonExecutionService,
  ],
  exports: [PositionHistoryHorizonExecutionLockModule, PositionHistoryHorizonExecutionRunnerService],
})
export class PositionHistoryHorizonExecutionModule {}
