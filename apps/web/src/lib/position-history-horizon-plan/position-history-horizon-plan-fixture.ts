import type { PositionHistoryHorizonPlanResponse } from "./position-history-horizon-plan-contract";

export function positionHistoryHorizonPlanFixture(): PositionHistoryHorizonPlanResponse {
  return {
    policyDays: 90,
    from: "2026-05-13T02:00:00.000Z",
    to: "2026-08-11T02:00:00.000Z",
    slices: { total: 2, fullSevenDay: 1, remainderHours: 144 },
    fleet: { total: 3, providerEligible: 2, providerDisabled: 1 },
    backfill: { targetVehiclePairs: 6, completedPairs: 2, incompletePairs: 4, providerEligibleIncompletePairs: 3, estimatedRemainingHourlyWindows: 300 },
    sliceStatuses: [
      { from: "2026-05-13T02:00:00.000Z", to: "2026-05-19T02:00:00.000Z", durationHours: 144, vehiclesTotal: 3, completed: 1, running: 0, pending: 1, none: 1, providerEligibleRemaining: 1, estimatedRemainingHourlyWindows: 144 },
      { from: "2026-08-04T02:00:00.000Z", to: "2026-08-11T02:00:00.000Z", durationHours: 168, vehiclesTotal: 3, completed: 1, running: 1, pending: 0, none: 1, providerEligibleRemaining: 2, estimatedRemainingHourlyWindows: 156 },
    ],
  };
}
