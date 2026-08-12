import type { PositionHistoryHorizonPlanResult } from "../position-history-horizon/position-history-horizon.types";

export type PositionHistoryObservationAggregate = Readonly<{
  rowCount: number;
  vehiclesWithObservations: number;
  firstObservationAt: Date | null;
  lastObservationAt: Date | null;
}>;

export interface PositionHistoryStatusObservationRepository {
  inspect(from: Date, to: Date): Promise<PositionHistoryObservationAggregate>;
}

export type PositionHistoryStatusResult = Readonly<{
  plan: PositionHistoryHorizonPlanResult;
  observations: PositionHistoryObservationAggregate;
}>;

export type PositionHistoryHorizonStatusResponse = Readonly<{
  policyDays: number;
  from: string;
  to: string;
  slices: Readonly<{ total: number; fullSevenDay: number; remainderHours: number | null }>;
  fleet: Readonly<{ total: number; providerEligible: number; providerDisabled: number }>;
  backfill: Readonly<{
    targetVehiclePairs: number;
    completedPairs: number;
    incompletePairs: number;
    providerEligibleIncompletePairs: number;
    estimatedRemainingHourlyWindows: number;
  }>;
  observations: Readonly<{
    rowCount: number;
    vehiclesWithObservations: number;
    vehiclesWithoutObservations: number;
    firstObservationAt: string | null;
    lastObservationAt: string | null;
  }>;
  sliceStatuses: readonly Readonly<{
    from: string;
    to: string;
    durationHours: number;
    vehiclesTotal: number;
    completed: number;
    running: number;
    pending: number;
    none: number;
    providerEligibleRemaining: number;
    estimatedRemainingHourlyWindows: number;
  }>[];
}>;
