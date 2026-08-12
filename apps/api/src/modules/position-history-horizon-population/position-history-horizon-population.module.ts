import { Module } from "@nestjs/common";
import { PositionHistoryBackfillModule } from "../position-history-backfill/position-history-backfill.module";
import { PositionHistoryHorizonPopulationService } from "./position-history-horizon-population.service";

@Module({
  imports: [PositionHistoryBackfillModule],
  providers: [PositionHistoryHorizonPopulationService],
  exports: [PositionHistoryHorizonPopulationService],
})
export class PositionHistoryHorizonPopulationModule {}
