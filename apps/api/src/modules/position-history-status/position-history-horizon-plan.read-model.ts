import type { PositionHistoryHorizonPlanResult } from "../position-history-horizon/position-history-horizon.types";
import type { PositionHistoryHorizonPlanResponse } from "./position-history-horizon-plan.types";

const HOUR_MS = 60 * 60 * 1_000;

/**
 * Manual population planning read model. It reuses the Stage 14B horizon planner and exposes only
 * planning facts. It never reads `VehiclePositionObservation`, so its cost is bounded by the fleet
 * and the horizon slice count rather than by stored observation volume.
 */
export function toPositionHistoryHorizonPlanResponse(plan: PositionHistoryHorizonPlanResult): PositionHistoryHorizonPlanResponse {
  return Object.freeze({
    policyDays: plan.horizon.policyDays,
    from: plan.horizon.from.toISOString(),
    to: plan.horizon.to.toISOString(),
    slices: Object.freeze({
      total: plan.targets.total,
      fullSevenDay: plan.targets.fullSevenDay,
      remainderHours: plan.targets.remainderDurationMs === null ? null : plan.targets.remainderDurationMs / HOUR_MS,
    }),
    fleet: Object.freeze({ total: plan.fleet.total, providerEligible: plan.fleet.providerEligible, providerDisabled: plan.fleet.providerDisabled }),
    backfill: Object.freeze({
      targetVehiclePairs: plan.targetVehiclePairs.total,
      completedPairs: plan.targetVehiclePairs.completed,
      incompletePairs: plan.targetVehiclePairs.incomplete,
      providerEligibleIncompletePairs: plan.targetVehiclePairs.providerEligibleIncomplete,
      estimatedRemainingHourlyWindows: plan.estimatedRemainingHourlyWindows,
    }),
    sliceStatuses: Object.freeze(plan.slices.map((slice) => Object.freeze({
      from: slice.from.toISOString(),
      to: slice.to.toISOString(),
      durationHours: slice.durationMs / HOUR_MS,
      vehiclesTotal: slice.vehiclesTotal,
      completed: slice.completed,
      running: slice.running,
      pending: slice.pending,
      none: slice.noExactCheckpoint,
      providerEligibleRemaining: slice.providerEligibleRemaining,
      estimatedRemainingHourlyWindows: slice.estimatedRemainingHourlyWindows,
    }))),
  });
}
