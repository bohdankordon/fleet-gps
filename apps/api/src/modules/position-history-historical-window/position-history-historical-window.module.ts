import { Module } from "@nestjs/common";
import { EquGpsModule } from "../equgps/equgps.module";
import { PositionHistoryHistoricalWindowService } from "./position-history-historical-window.service";
import { POSITION_HISTORY_HISTORICAL_WINDOW_CLOCK, POSITION_HISTORY_HISTORICAL_WINDOW_SLEEPER } from "./position-history-historical-window.tokens";
import type { PositionHistoryHistoricalWindowClock, PositionHistoryHistoricalWindowSleeper } from "./position-history-historical-window.types";

@Module({
  imports: [EquGpsModule],
  providers: [
    { provide: POSITION_HISTORY_HISTORICAL_WINDOW_CLOCK, useValue: { now: (): Date => new Date() } satisfies PositionHistoryHistoricalWindowClock },
    { provide: POSITION_HISTORY_HISTORICAL_WINDOW_SLEEPER, useValue: { sleep: (durationMs: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, durationMs)) } satisfies PositionHistoryHistoricalWindowSleeper },
    PositionHistoryHistoricalWindowService,
  ],
  exports: [PositionHistoryHistoricalWindowService, POSITION_HISTORY_HISTORICAL_WINDOW_SLEEPER],
})
export class PositionHistoryHistoricalWindowModule {}
