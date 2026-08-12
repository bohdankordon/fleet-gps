import type { PositionHistoryHorizonStatusResponse, PositionHistoryStatusResult } from "./position-history-status.types";

const HOUR_MS = 60 * 60 * 1_000;

export function toPositionHistoryHorizonStatusResponse(result: PositionHistoryStatusResult): PositionHistoryHorizonStatusResponse {
  const { plan, observations } = result;
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
    observations: Object.freeze({
      rowCount: observations.rowCount,
      vehiclesWithObservations: observations.vehiclesWithObservations,
      vehiclesWithoutObservations: plan.fleet.total - observations.vehiclesWithObservations,
      firstObservationAt: observations.firstObservationAt?.toISOString() ?? null,
      lastObservationAt: observations.lastObservationAt?.toISOString() ?? null,
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
