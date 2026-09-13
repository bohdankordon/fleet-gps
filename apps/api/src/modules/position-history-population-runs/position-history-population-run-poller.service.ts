import { Injectable, Logger } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { PositionHistoryPopulationRunWorkerService } from "./position-history-population-run-worker.service";

export const POSITION_HISTORY_POPULATION_RUN_POLL_INTERVAL_MS = 30_000;

@Injectable()
export class PositionHistoryPopulationRunPollerService {
  private readonly logger = new Logger(PositionHistoryPopulationRunPollerService.name);
  private invoking = false;

  public constructor(private readonly worker: PositionHistoryPopulationRunWorkerService) {}

  @Interval("taxi-gps:position-history-population-runs", POSITION_HISTORY_POPULATION_RUN_POLL_INTERVAL_MS)
  public async poll(): Promise<void> {
    if (this.invoking) return;
    this.invoking = true;
    try {
      const result = await this.worker.processNextAvailableRun();
      if (result.outcome === "YIELDED") this.logger.log("Durable position-history population yielded after one bounded chunk.", { outcome: result.outcome, committedWindows: result.committedWindows });
    }
    catch { this.logger.error("Durable position-history population poll failed safely."); }
    finally { this.invoking = false; }
  }
}
