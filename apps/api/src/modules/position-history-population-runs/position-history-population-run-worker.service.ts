import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { PositionHistoryHorizonAlreadyRunningError, PositionHistoryHorizonExecutionLockService } from "../position-history-horizon-execution/position-history-horizon-execution-lock.service";
import { PositionHistoryHorizonPopulationError } from "../position-history-horizon-population/position-history-horizon-population.error";
import { PositionHistoryHorizonPopulationService } from "../position-history-horizon-population/position-history-horizon-population.service";
import { POSITION_HISTORY_POPULATION_RUN_CHUNK_WINDOWS, POSITION_HISTORY_POPULATION_RUN_FAILURE_CODE, POSITION_HISTORY_POPULATION_RUN_HEARTBEAT_MS } from "./position-history-population-run.constants";
import { PositionHistoryPopulationRunStateService } from "./position-history-population-run-state.service";
import { POSITION_HISTORY_POPULATION_RUN_HEARTBEAT_SCHEDULER } from "./position-history-population-run.tokens";
import type { PositionHistoryPopulationRunHeartbeatScheduler, PositionHistoryPopulationRunWorkerResult } from "./position-history-population-run.types";

@Injectable()
export class PositionHistoryPopulationRunWorkerService {
  public constructor(
    private readonly state: PositionHistoryPopulationRunStateService,
    private readonly lock: PositionHistoryHorizonExecutionLockService,
    private readonly population: PositionHistoryHorizonPopulationService,
    @Inject(POSITION_HISTORY_POPULATION_RUN_HEARTBEAT_SCHEDULER) private readonly heartbeatScheduler: PositionHistoryPopulationRunHeartbeatScheduler,
  ) {}

  public async processNextAvailableRun(): Promise<PositionHistoryPopulationRunWorkerResult> {
    const eligible = await this.state.findEligible();
    if (eligible === null) return { outcome: "NO_WORK", runId: null, committedWindows: null };
    return this.processEligible(eligible.id);
  }

  public async processRun(runId: string): Promise<PositionHistoryPopulationRunWorkerResult> {
    const eligible = await this.state.findEligible(runId);
    if (eligible === null) return { outcome: "NO_WORK", runId, committedWindows: null };
    return this.processEligible(runId);
  }

  private async processEligible(runId: string): Promise<PositionHistoryPopulationRunWorkerResult> {
    try {
      return await this.lock.runExclusive(async () => {
        const leaseOwner = randomUUID();
        const claimed = await this.state.claim(runId, leaseOwner);
        if (claimed === null) return { outcome: "NO_WORK", runId, committedWindows: null };
        const stopHeartbeat = this.heartbeatScheduler.start(async () => { await this.state.heartbeat(runId, leaseOwner); }, POSITION_HISTORY_POPULATION_RUN_HEARTBEAT_MS);
        try { return await this.processClaimed(runId, leaseOwner); }
        finally { stopHeartbeat(); }
      });
    } catch (error) {
      if (error instanceof PositionHistoryHorizonAlreadyRunningError) return { outcome: "LOCK_UNAVAILABLE", runId, committedWindows: null };
      throw error;
    }
  }

  private async processClaimed(runId: string, leaseOwner: string): Promise<PositionHistoryPopulationRunWorkerResult> {
    while (true) {
      const before = await this.state.getOwned(runId, leaseOwner);
      if (before === null) return { outcome: "STALE", runId, committedWindows: null };
      const remainingBudget = before.windowBudget - before.committedWindows;
      if (remainingBudget <= 0) return this.finishSuccess(runId, leaseOwner, before.committedWindows);
      const chunkBudget = Math.min(POSITION_HISTORY_POPULATION_RUN_CHUNK_WINDOWS, remainingBudget);
      let horizonComplete = false;
      try {
        const result = await this.population.run(before.to, {
          maxWindows: chunkBudget,
          ...(before.excludeProviderDisabled ? { excludeProviderDisabled: true } : {}),
          durableAccounting: { runId, leaseOwner },
        });
        horizonComplete = result.horizonComplete;
      } catch (error) {
        const code = error instanceof PositionHistoryHorizonPopulationError
          ? POSITION_HISTORY_POPULATION_RUN_FAILURE_CODE.EXECUTION_FAILED
          : POSITION_HISTORY_POPULATION_RUN_FAILURE_CODE.WORKER_FAILED;
        const latest = await this.state.getOwned(runId, leaseOwner);
        const failed = await this.state.fail(runId, leaseOwner, code);
        return { outcome: failed ? "FAILED" : "STALE", runId, committedWindows: latest?.committedWindows ?? before.committedWindows };
      }
      const after = await this.state.getOwned(runId, leaseOwner);
      if (after === null) return { outcome: "STALE", runId, committedWindows: null };
      if (after.committedWindows >= after.windowBudget || horizonComplete || after.committedWindows === before.committedWindows) return this.finishSuccess(runId, leaseOwner, after.committedWindows);
    }
  }

  private async finishSuccess(runId: string, leaseOwner: string, committedWindows: number): Promise<PositionHistoryPopulationRunWorkerResult> {
    const succeeded = await this.state.succeed(runId, leaseOwner);
    return { outcome: succeeded ? "SUCCEEDED" : "STALE", runId, committedWindows };
  }
}
