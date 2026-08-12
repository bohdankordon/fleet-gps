import type { PositionBackfillStatus } from "../../generated/prisma/client";

export type PositionHistoryCoverageTarget = Readonly<{
  from: Date;
  to: Date;
}>;

export type PositionHistoryCoverageVehicleFacts = Readonly<{
  vehicleId: string;
  providerDisabled: boolean;
  exactCheckpointStatus: PositionBackfillStatus | null;
  observationRows: number;
  fleetSyncRows: number;
  historicalBackfillRows: number;
  firstObservedAt: Date | null;
  lastObservedAt: Date | null;
}>;

export interface PositionHistoryCoverageRepository {
  inspect(target: PositionHistoryCoverageTarget): Promise<readonly PositionHistoryCoverageVehicleFacts[]>;
}

export type PositionHistoryCoverageResult = Readonly<{
  range: Readonly<{ from: Date; to: Date; inclusive: true }>;
  checkpointCoverage: Readonly<{
    vehiclesTotal: number;
    completed: number;
    running: number;
    pending: number;
    noExactCheckpoint: number;
  }>;
  observationPresence: Readonly<{
    rowsTotal: number;
    vehiclesWithObservations: number;
    vehiclesWithoutObservations: number;
    fleetSyncRows: number;
    historicalBackfillRows: number;
    firstObservedAt: Date | null;
    lastObservedAt: Date | null;
  }>;
  checkpointObservationCrossSummary: Readonly<{
    completedWithObservations: number;
    completedWithoutObservations: number;
    incompleteOrNoExactCheckpointWithObservations: number;
    incompleteOrNoExactCheckpointWithoutObservations: number;
  }>;
  providerDisabledVehicles: number;
}>;
