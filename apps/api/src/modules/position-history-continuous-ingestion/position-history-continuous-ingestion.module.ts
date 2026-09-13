import { Module } from "@nestjs/common";
import { ApiConfigModule } from "../../config/api-config.module";
import { DatabaseModule } from "../database/database.module";
import { PositionHistoryHistoricalWindowModule } from "../position-history-historical-window";
import { PositionHistoryIngestionCursorModule } from "../position-history-ingestion-cursor";
import { PositionHistoryReplayGenerationModule } from "../position-history-replay-generation";
import { PositionHistoryHorizonExecutionLockModule } from "../position-history-horizon-execution/position-history-horizon-execution-lock.module";
import { PrismaPositionHistoryContinuousIngestionRepository } from "./prisma-position-history-continuous-ingestion.repository";
import { PositionHistoryContinuousIngestionPollerService } from "./position-history-continuous-ingestion-poller.service";
import { PositionHistoryContinuousIngestionStatusService } from "./position-history-continuous-ingestion-status.service";
import { PositionHistoryContinuousIngestionTimerAdapter } from "./position-history-continuous-ingestion-timer.adapter";
import { POSITION_HISTORY_CONTINUOUS_CLOCK, POSITION_HISTORY_CONTINUOUS_REPOSITORY, POSITION_HISTORY_CONTINUOUS_SLEEPER, POSITION_HISTORY_CONTINUOUS_TIMER } from "./position-history-continuous-ingestion.tokens";
import type { PositionHistoryContinuousClock, PositionHistoryContinuousSleeper } from "./position-history-continuous-ingestion.types";
import { PositionHistoryContinuousIngestionWorkerService } from "./position-history-continuous-ingestion-worker.service";
import { POSITION_HISTORY_REPLAY_HEARTBEAT_SCHEDULER } from "./position-history-replay-orchestration.tokens";
import type { PositionHistoryReplayHeartbeatScheduler } from "./position-history-replay-orchestration.types";
import { PositionHistoryReplayWorkerService } from "./position-history-replay-worker.service";
import { PositionHistoryWorkloadCoordinatorService } from "./position-history-workload-coordinator.service";

@Module({
  imports: [ApiConfigModule, DatabaseModule, PositionHistoryIngestionCursorModule, PositionHistoryHistoricalWindowModule, PositionHistoryHorizonExecutionLockModule, PositionHistoryReplayGenerationModule],
  providers: [
    { provide: POSITION_HISTORY_CONTINUOUS_REPOSITORY, useExisting: PrismaPositionHistoryContinuousIngestionRepository },
    { provide: POSITION_HISTORY_CONTINUOUS_CLOCK, useValue: { now: (): Date => new Date() } satisfies PositionHistoryContinuousClock },
    { provide: POSITION_HISTORY_CONTINUOUS_SLEEPER, useValue: { sleep: (durationMs: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, durationMs)) } satisfies PositionHistoryContinuousSleeper },
    { provide: POSITION_HISTORY_CONTINUOUS_TIMER, useExisting: PositionHistoryContinuousIngestionTimerAdapter },
    {
      provide: POSITION_HISTORY_REPLAY_HEARTBEAT_SCHEDULER,
      useValue: {
        start: (work: () => Promise<void>, intervalMs: number): (() => void) => {
          const timer = setInterval(() => { void work().catch(() => undefined); }, intervalMs);
          timer.unref();
          return () => clearInterval(timer);
        },
      } satisfies PositionHistoryReplayHeartbeatScheduler,
    },
    PrismaPositionHistoryContinuousIngestionRepository,
    PositionHistoryContinuousIngestionTimerAdapter,
    PositionHistoryContinuousIngestionStatusService,
    PositionHistoryContinuousIngestionWorkerService,
    PositionHistoryReplayWorkerService,
    PositionHistoryWorkloadCoordinatorService,
    PositionHistoryContinuousIngestionPollerService,
  ],
  exports: [PositionHistoryContinuousIngestionPollerService, PositionHistoryContinuousIngestionStatusService],
})
export class PositionHistoryContinuousIngestionModule {}
