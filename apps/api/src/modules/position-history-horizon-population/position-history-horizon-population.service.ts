import { Injectable } from "@nestjs/common";
import { PositionHistoryFleetBackfillService } from "../position-history-backfill/position-history-fleet-backfill.service";
import type { PositionHistoryFleetBackfillResult } from "../position-history-backfill/position-history-backfill.types";
import { partitionPositionHistoryHorizon } from "../position-history-horizon/position-history-horizon-partition";
import { POSITION_HISTORY_HORIZON_POLICY } from "../position-history-horizon/position-history-horizon.policy";
import { PositionHistoryHorizonPopulationError } from "./position-history-horizon-population.error";
import type { PositionHistoryHorizonPopulationOptions, PositionHistoryHorizonPopulationProgress, PositionHistoryHorizonPopulationResult } from "./position-history-horizon-population.types";

type MutableProgress = {
  slicesVisited: number;
  slicesAlreadyComplete: number;
  providerDisabledExcluded: number;
  windowsRequested: number;
  providerRequests: number;
  providerRows: number;
  candidates: number;
  inserted: number;
  duplicates: number;
  invalid: number;
  retries: number;
  rateLimitResponses: number;
};

function positiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 1;
}

function add(progress: MutableProgress, result: PositionHistoryFleetBackfillResult): void {
  progress.slicesVisited += 1;
  if (result.vehiclesAlreadyCompleted === result.vehiclesConsidered) progress.slicesAlreadyComplete += 1;
  progress.providerDisabledExcluded = Math.max(progress.providerDisabledExcluded, result.providerDisabledExcluded);
  progress.windowsRequested += result.windowsRequested;
  progress.providerRequests += result.providerRequests;
  progress.providerRows += result.providerRows;
  progress.candidates += result.candidates;
  progress.inserted += result.inserted;
  progress.duplicates += result.duplicates;
  progress.invalid += result.invalid;
  progress.retries += result.retries;
  progress.rateLimitResponses += result.rateLimitResponses;
}

function snapshot(base: { horizonFrom: Date; horizonTo: Date; slicesTotal: number }, progress: MutableProgress, stoppedByBudget: boolean, horizonComplete: boolean, current: { from: Date; to: Date } | null): PositionHistoryHorizonPopulationProgress {
  return Object.freeze({
    horizonFrom: new Date(base.horizonFrom.getTime()),
    horizonTo: new Date(base.horizonTo.getTime()),
    policyDays: POSITION_HISTORY_HORIZON_POLICY.days,
    slicesTotal: base.slicesTotal,
    ...progress,
    stoppedByBudget,
    horizonComplete,
    currentSliceFrom: current === null ? null : new Date(current.from.getTime()),
    currentSliceTo: current === null ? null : new Date(current.to.getTime()),
  });
}

@Injectable()
export class PositionHistoryHorizonPopulationService {
  public constructor(private readonly fleetBackfill: PositionHistoryFleetBackfillService) {}

  public async run(to: Date, options: PositionHistoryHorizonPopulationOptions): Promise<PositionHistoryHorizonPopulationResult> {
    if (!Number.isFinite(to.getTime()) || !positiveInteger(options.maxWindows) || (options.excludeProviderDisabled !== undefined && typeof options.excludeProviderDisabled !== "boolean")) throw new Error("Invalid position history horizon population target");
    const chronological = partitionPositionHistoryHorizon(to, POSITION_HISTORY_HORIZON_POLICY.days);
    const execution = [...chronological].reverse();
    const base = { horizonFrom: chronological[0]!.from, horizonTo: to, slicesTotal: chronological.length };
    const progress: MutableProgress = { slicesVisited: 0, slicesAlreadyComplete: 0, providerDisabledExcluded: 0, windowsRequested: 0, providerRequests: 0, providerRows: 0, candidates: 0, inserted: 0, duplicates: 0, invalid: 0, retries: 0, rateLimitResponses: 0 };
    let priorWindowCommitted = false;

    for (const [executionIndex, slice] of execution.entries()) {
      const remainingBudget = options.maxWindows - progress.windowsRequested;
      if (remainingBudget <= 0) return snapshot(base, progress, true, false, slice);
      try {
        const result = await this.fleetBackfill.run(
          { from: slice.from, to: slice.to },
          {
            maxWindows: remainingBudget,
            ...(options.excludeProviderDisabled === true ? { excludeProviderDisabled: true } : {}),
            ...(priorWindowCommitted ? { paceBeforeFirstWindow: true } : {}),
            ...(options.durableAccounting === undefined ? {} : { durableAccounting: options.durableAccounting }),
          },
        );
        add(progress, result);
        priorWindowCommitted ||= result.windowsRequested > 0;
        const sliceComplete = result.vehiclesAlreadyCompleted + result.vehiclesCompleted === result.vehiclesConsidered;
        if (sliceComplete && executionIndex === execution.length - 1) continue;
        if (result.stoppedByBudget || progress.windowsRequested >= options.maxWindows) return snapshot(base, progress, true, false, slice);
        if (!sliceComplete) return snapshot(base, progress, false, false, slice);
      } catch (error) {
        throw new PositionHistoryHorizonPopulationError(snapshot(base, progress, false, false, slice), error);
      }
    }
    return snapshot(base, progress, false, true, null);
  }
}
