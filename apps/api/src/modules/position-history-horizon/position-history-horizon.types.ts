import type { PositionBackfillStatus } from "../../generated/prisma/client";

export type PositionHistoryHorizonSlice = Readonly<{
  index: number;
  from: Date;
  to: Date;
  durationMs: number;
}>;

export type PositionHistoryHorizonCheckpointFact = Readonly<{
  sliceIndex: number;
  vehicleId: string;
  providerDisabled: boolean;
  exactCheckpointStatus: PositionBackfillStatus | null;
  exactCheckpointNextFrom: Date | null;
}>;

export interface PositionHistoryHorizonRepository {
  inspect(slices: readonly PositionHistoryHorizonSlice[]): Promise<readonly PositionHistoryHorizonCheckpointFact[]>;
}

export type PositionHistoryHorizonSliceResult = Readonly<{
  index: number;
  from: Date;
  to: Date;
  durationMs: number;
  vehiclesTotal: number;
  completed: number;
  running: number;
  pending: number;
  noExactCheckpoint: number;
  providerDisabledVehicles: number;
  remainingFleetVehicles: number;
  providerEligibleRemaining: number;
  estimatedRemainingHourlyWindows: number;
}>;

export type PositionHistoryHorizonPlanResult = Readonly<{
  horizon: Readonly<{ from: Date; to: Date; policyDays: number }>;
  targets: Readonly<{ total: number; fullSevenDay: number; remainderDurationMs: number | null }>;
  fleet: Readonly<{ total: number; providerDisabled: number; providerEligible: number }>;
  targetVehiclePairs: Readonly<{ total: number; completed: number; incomplete: number; providerEligibleIncomplete: number }>;
  estimatedRemainingHourlyWindows: number;
  slices: readonly PositionHistoryHorizonSliceResult[];
}>;
