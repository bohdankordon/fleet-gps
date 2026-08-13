import { Module } from "@nestjs/common";
import { ApiConfigModule } from "../../config/api-config.module";
import { DatabaseModule } from "../database/database.module";
import { PositionHistoryHorizonModule } from "../position-history-horizon/position-history-horizon.module";
import { PositionHistoryPopulationRunModule } from "./position-history-population-run.module";
import { PositionHistoryMaintenanceService } from "./position-history-maintenance.service";

@Module({
  imports: [ApiConfigModule, DatabaseModule, PositionHistoryHorizonModule, PositionHistoryPopulationRunModule],
  providers: [PositionHistoryMaintenanceService],
  exports: [PositionHistoryMaintenanceService],
})
export class PositionHistoryMaintenanceModule {}
