import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module";
import { PositionHistoryHorizonExecutionModule } from "../position-history-horizon-execution/position-history-horizon-execution.module";
import { PositionHistoryHorizonPopulationModule } from "../position-history-horizon-population/position-history-horizon-population.module";
import { PositionHistoryPopulationRunCreationService } from "./position-history-population-run-creation.service";
import { PositionHistoryPopulationRunStateService } from "./position-history-population-run-state.service";
import { POSITION_HISTORY_POPULATION_RUN_CLOCK, POSITION_HISTORY_POPULATION_RUN_HEARTBEAT_SCHEDULER } from "./position-history-population-run.tokens";
import type { PositionHistoryPopulationRunClock, PositionHistoryPopulationRunHeartbeatScheduler } from "./position-history-population-run.types";
import { PositionHistoryPopulationRunWorkerService } from "./position-history-population-run-worker.service";

@Module({
  imports: [DatabaseModule, PositionHistoryHorizonPopulationModule, PositionHistoryHorizonExecutionModule],
  providers: [
    { provide: POSITION_HISTORY_POPULATION_RUN_CLOCK, useValue: { now: (): Date => new Date() } satisfies PositionHistoryPopulationRunClock },
    {
      provide: POSITION_HISTORY_POPULATION_RUN_HEARTBEAT_SCHEDULER,
      useValue: {
        start: (work: () => Promise<void>, intervalMs: number): (() => void) => {
          const timer = setInterval(() => { void work().catch(() => undefined); }, intervalMs);
          timer.unref();
          return () => clearInterval(timer);
        },
      } satisfies PositionHistoryPopulationRunHeartbeatScheduler,
    },
    PositionHistoryPopulationRunCreationService,
    PositionHistoryPopulationRunStateService,
    PositionHistoryPopulationRunWorkerService,
  ],
  exports: [PositionHistoryPopulationRunCreationService, PositionHistoryPopulationRunWorkerService],
})
export class PositionHistoryPopulationRunModule {}
