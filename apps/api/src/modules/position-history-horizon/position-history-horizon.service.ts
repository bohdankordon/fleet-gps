import { Inject, Injectable } from "@nestjs/common";
import { PositionBackfillStatus } from "../../generated/prisma/client";
import { POSITION_HISTORY_BACKFILL_MAX_TARGET_MS } from "../position-history-backfill/position-history-backfill.constants";
import { estimatePositionHistoryBackfillRemainingWindows } from "../position-history-backfill/position-history-backfill-planning";
import { partitionPositionHistoryHorizon } from "./position-history-horizon-partition";
import { POSITION_HISTORY_HORIZON_POLICY } from "./position-history-horizon.policy";
import { POSITION_HISTORY_HORIZON_REPOSITORY } from "./position-history-horizon.tokens";
import type { PositionHistoryHorizonCheckpointFact, PositionHistoryHorizonPlanResult, PositionHistoryHorizonRepository, PositionHistoryHorizonSlice } from "./position-history-horizon.types";

function factsForSlice(facts: readonly PositionHistoryHorizonCheckpointFact[], slice: PositionHistoryHorizonSlice): readonly PositionHistoryHorizonCheckpointFact[] {
  return facts.filter((fact) => fact.sliceIndex === slice.index);
}

function remainingWindows(fact: PositionHistoryHorizonCheckpointFact, slice: PositionHistoryHorizonSlice): number {
  return estimatePositionHistoryBackfillRemainingWindows({ rangeFrom: slice.from, rangeTo: slice.to, status: fact.exactCheckpointStatus, nextFrom: fact.exactCheckpointNextFrom });
}

@Injectable()
export class PositionHistoryHorizonService {
  public constructor(@Inject(POSITION_HISTORY_HORIZON_REPOSITORY) private readonly repository: PositionHistoryHorizonRepository) {}

  public async run(to: Date): Promise<PositionHistoryHorizonPlanResult> {
    if (!Number.isFinite(to.getTime())) throw new Error("Invalid position history horizon anchor");
    const slices = partitionPositionHistoryHorizon(to, POSITION_HISTORY_HORIZON_POLICY.days);
    const facts = await this.repository.inspect(slices);
    const firstSliceFacts = factsForSlice(facts, slices[0]!);
    const fleetIds = firstSliceFacts.map((fact) => fact.vehicleId);
    for (const slice of slices) {
      const sliceFacts = factsForSlice(facts, slice);
      if (sliceFacts.length !== fleetIds.length || sliceFacts.some((fact, index) => fact.vehicleId !== fleetIds[index])) throw new Error("Inconsistent position history horizon snapshot");
    }
    const fleetTotal = fleetIds.length;
    const providerDisabled = firstSliceFacts.filter((fact) => fact.providerDisabled).length;
    const sliceResults = slices.map((slice) => {
      const sliceFacts = factsForSlice(facts, slice);
      const completed = sliceFacts.filter((fact) => fact.exactCheckpointStatus === PositionBackfillStatus.COMPLETED).length;
      const running = sliceFacts.filter((fact) => fact.exactCheckpointStatus === PositionBackfillStatus.RUNNING).length;
      const pending = sliceFacts.filter((fact) => fact.exactCheckpointStatus === PositionBackfillStatus.PENDING).length;
      const noExactCheckpoint = sliceFacts.filter((fact) => fact.exactCheckpointStatus === null).length;
      const providerEligibleIncomplete = sliceFacts.filter((fact) => !fact.providerDisabled && fact.exactCheckpointStatus !== PositionBackfillStatus.COMPLETED);
      return Object.freeze({
        index: slice.index,
        from: new Date(slice.from.getTime()),
        to: new Date(slice.to.getTime()),
        durationMs: slice.durationMs,
        vehiclesTotal: fleetTotal,
        completed,
        running,
        pending,
        noExactCheckpoint,
        providerDisabledVehicles: providerDisabled,
        remainingFleetVehicles: fleetTotal - completed,
        providerEligibleRemaining: providerEligibleIncomplete.length,
        estimatedRemainingHourlyWindows: providerEligibleIncomplete.reduce((sum, fact) => sum + remainingWindows(fact, slice), 0),
      });
    });
    const completedPairs = sliceResults.reduce((sum, slice) => sum + slice.completed, 0);
    const pairsTotal = fleetTotal * slices.length;
    const providerEligibleIncompletePairs = sliceResults.reduce((sum, slice) => sum + slice.providerEligibleRemaining, 0);
    return Object.freeze({
      horizon: Object.freeze({ from: new Date(slices[0]!.from.getTime()), to: new Date(to.getTime()), policyDays: POSITION_HISTORY_HORIZON_POLICY.days }),
      targets: Object.freeze({
        total: slices.length,
        fullSevenDay: slices.filter((slice) => slice.durationMs === POSITION_HISTORY_BACKFILL_MAX_TARGET_MS).length,
        remainderDurationMs: POSITION_HISTORY_HORIZON_POLICY.durationMs % POSITION_HISTORY_BACKFILL_MAX_TARGET_MS === 0 ? null : POSITION_HISTORY_HORIZON_POLICY.durationMs % POSITION_HISTORY_BACKFILL_MAX_TARGET_MS,
      }),
      fleet: Object.freeze({ total: fleetTotal, providerDisabled, providerEligible: fleetTotal - providerDisabled }),
      targetVehiclePairs: Object.freeze({ total: pairsTotal, completed: completedPairs, incomplete: pairsTotal - completedPairs, providerEligibleIncomplete: providerEligibleIncompletePairs }),
      estimatedRemainingHourlyWindows: sliceResults.reduce((sum, slice) => sum + slice.estimatedRemainingHourlyWindows, 0),
      slices: Object.freeze(sliceResults),
    });
  }
}
