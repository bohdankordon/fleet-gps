import { Inject, Injectable } from "@nestjs/common";
import { PositionBackfillStatus } from "../../generated/prisma/client";
import { PositionHistoryBackfillTargetError } from "./position-history-backfill.errors";
import { POSITION_HISTORY_FLEET_BACKFILL_REPOSITORY } from "./position-history-backfill.tokens";
import { estimatePositionHistoryBackfillRemainingWindows } from "./position-history-backfill-planning";
import { POSITION_HISTORY_BACKFILL_MAX_TARGET_MS, POSITION_HISTORY_BACKFILL_WINDOW_MS, PositionHistoryBackfillService } from "./position-history-backfill.service";
import type { PositionHistoryBackfillResult, PositionHistoryFleetBackfillRepository, PositionHistoryFleetBackfillResult, PositionHistoryFleetBackfillRunOptions, PositionHistoryFleetBackfillTarget, PositionHistoryFleetBackfillVehicle } from "./position-history-backfill.types";

function validTarget(target: PositionHistoryFleetBackfillTarget): boolean {
  const from = target.from.getTime();
  const to = target.to.getTime();
  return Number.isFinite(from) && Number.isFinite(to) && from < to && to - from <= POSITION_HISTORY_BACKFILL_MAX_TARGET_MS;
}

function positiveInteger(value: number | undefined): boolean {
  return value === undefined || (Number.isSafeInteger(value) && value >= 1);
}

function isMapped(vehicle: PositionHistoryFleetBackfillVehicle): boolean {
  return vehicle.externalDeviceId !== null && Number.isSafeInteger(vehicle.externalDeviceId) && vehicle.externalDeviceId > 0;
}

function isCompleted(vehicle: PositionHistoryFleetBackfillVehicle): boolean {
  return vehicle.checkpoint?.status === PositionBackfillStatus.COMPLETED;
}

function remainingWindows(vehicle: PositionHistoryFleetBackfillVehicle, target: PositionHistoryFleetBackfillTarget): number {
  return estimatePositionHistoryBackfillRemainingWindows({ rangeFrom: target.from, rangeTo: target.to, status: vehicle.checkpoint?.status ?? null, nextFrom: vehicle.checkpoint?.nextFrom ?? null });
}

function addResult(aggregate: MutableAggregate, result: PositionHistoryBackfillResult): void {
  aggregate.windowsRequested += result.windowsCompleted;
  aggregate.providerRequests += result.requests;
  aggregate.providerRows += result.providerRows;
  aggregate.candidates += result.historyCandidates;
  aggregate.inserted += result.historyInserted;
  aggregate.duplicates += result.historyDuplicates;
  aggregate.invalid += result.historySkippedInvalid;
  aggregate.retries += result.retries;
  aggregate.rateLimitResponses += result.rateLimitResponses;
}

type MutableAggregate = {
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

@Injectable()
export class PositionHistoryFleetBackfillService {
  public constructor(
    private readonly vehicleBackfill: PositionHistoryBackfillService,
    @Inject(POSITION_HISTORY_FLEET_BACKFILL_REPOSITORY) private readonly repository: PositionHistoryFleetBackfillRepository,
  ) {}

  public async run(target: PositionHistoryFleetBackfillTarget, options: PositionHistoryFleetBackfillRunOptions = {}): Promise<PositionHistoryFleetBackfillResult> {
    if (!validTarget(target) || !positiveInteger(options.maxVehicles) || !positiveInteger(options.maxWindows) || (options.plan !== undefined && typeof options.plan !== "boolean") || (options.excludeProviderDisabled !== undefined && typeof options.excludeProviderDisabled !== "boolean") || (options.paceBeforeFirstWindow !== undefined && typeof options.paceBeforeFirstWindow !== "boolean")) throw new PositionHistoryBackfillTargetError();
    const fleet = await this.repository.inspect(target);
    const providerDisabledExcluded = options.excludeProviderDisabled === true ? fleet.filter((vehicle) => vehicle.providerDisabled).length : 0;
    const eligibleFleet = options.excludeProviderDisabled === true ? fleet.filter((vehicle) => !vehicle.providerDisabled) : fleet;
    const considered = eligibleFleet.slice(0, options.maxVehicles ?? eligibleFleet.length);
    const vehiclesAlreadyCompleted = considered.filter(isCompleted).length;
    const pendingVehicles = considered.filter((vehicle) => !isCompleted(vehicle) && (vehicle.checkpoint === null || vehicle.checkpoint.nextFrom.getTime() <= target.from.getTime())).length;
    const partialVehicles = considered.filter((vehicle) => !isCompleted(vehicle) && vehicle.checkpoint !== null && vehicle.checkpoint.nextFrom.getTime() > target.from.getTime()).length;
    const unmappedVehicles = considered.filter((vehicle) => !isMapped(vehicle)).length;
    const estimatedRemainingWindows = considered.filter(isMapped).reduce((total, vehicle) => total + remainingWindows(vehicle, target), 0);
    const initialRemainingVehicles = fleet.filter((vehicle) => !isCompleted(vehicle)).length;
    const aggregate: MutableAggregate = { windowsRequested: 0, providerRequests: 0, providerRows: 0, candidates: 0, inserted: 0, duplicates: 0, invalid: 0, retries: 0, rateLimitResponses: 0 };
    const base = {
      plan: options.plan === true,
      vehiclesTotal: fleet.length,
      providerDisabledExcluded,
      vehiclesConsidered: considered.length,
      vehiclesAlreadyCompleted,
      pendingVehicles,
      partialVehicles,
      unmappedVehicles,
      estimatedRemainingWindows,
    };

    if (options.plan === true) {
      const maxWindowsLimits = options.maxWindows !== undefined && options.maxWindows < estimatedRemainingWindows;
      const maxVehiclesLimits = considered.length < eligibleFleet.length && eligibleFleet.slice(considered.length).some((vehicle) => !isCompleted(vehicle));
      return Object.freeze({ ...base, vehiclesStarted: 0, vehiclesCompleted: 0, vehiclesRemaining: initialRemainingVehicles, ...aggregate, stoppedByBudget: maxWindowsLimits || maxVehiclesLimits });
    }

    let vehiclesStarted = 0;
    let vehiclesCompleted = 0;
    let stoppedByBudget = false;
    let previousWindowCommitted = options.paceBeforeFirstWindow === true;
    for (const vehicle of considered) {
      if (isCompleted(vehicle) || !isMapped(vehicle)) continue;
      const globalWindowsRemaining = options.maxWindows === undefined ? undefined : options.maxWindows - aggregate.windowsRequested;
      if (globalWindowsRemaining !== undefined && globalWindowsRemaining <= 0) { stoppedByBudget = true; break; }
      vehiclesStarted += 1;
      const perVehicleMaxWindows = globalWindowsRemaining === undefined ? undefined : Math.min(globalWindowsRemaining, 168);
      const result = await this.vehicleBackfill.run(
        { vehicleId: vehicle.vehicleId, from: target.from, to: target.to },
        {
          ...(perVehicleMaxWindows === undefined ? {} : { maxWindows: perVehicleMaxWindows }),
          ...(previousWindowCommitted ? { paceBeforeFirstWindow: true } : {}),
          ...(options.durableAccounting === undefined ? {} : { durableAccounting: options.durableAccounting }),
        },
      );
      addResult(aggregate, result);
      previousWindowCommitted ||= result.windowsCompleted > 0;
      if (result.completed) vehiclesCompleted += 1;
      else { stoppedByBudget = true; break; }
    }
    if (!stoppedByBudget && considered.length < eligibleFleet.length && eligibleFleet.slice(considered.length).some((vehicle) => !isCompleted(vehicle))) stoppedByBudget = true;
    return Object.freeze({
      ...base,
      vehiclesStarted,
      vehiclesCompleted,
      vehiclesRemaining: initialRemainingVehicles - vehiclesCompleted,
      ...aggregate,
      stoppedByBudget,
    });
  }
}
