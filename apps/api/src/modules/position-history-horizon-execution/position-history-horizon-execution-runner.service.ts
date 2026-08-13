import { Injectable } from "@nestjs/common";
import { PositionHistoryHorizonPopulationService } from "../position-history-horizon-population/position-history-horizon-population.service";
import type { PositionHistoryHorizonPopulationOptions, PositionHistoryHorizonPopulationResult } from "../position-history-horizon-population/position-history-horizon-population.types";
import { PositionHistoryHorizonExecutionLockService } from "./position-history-horizon-execution-lock.service";

/** The single lock-aware entry point shared by browser execution and the existing CLI. */
@Injectable()
export class PositionHistoryHorizonExecutionRunnerService {
  public constructor(private readonly population: PositionHistoryHorizonPopulationService, private readonly lock: PositionHistoryHorizonExecutionLockService) {}

  public run(to: Date, options: PositionHistoryHorizonPopulationOptions): Promise<PositionHistoryHorizonPopulationResult> {
    return this.lock.runExclusive(() => this.population.run(to, options));
  }
}
