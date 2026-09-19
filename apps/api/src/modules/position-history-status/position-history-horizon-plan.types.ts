export type PositionHistoryHorizonPlanResponse = Readonly<{
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
