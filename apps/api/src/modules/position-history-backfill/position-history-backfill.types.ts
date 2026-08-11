import type { PositionBackfillStatus } from "../../generated/prisma/client";
import type { PositionHistoryCandidate } from "../position-history";

export type PositionHistoryBackfillTarget = Readonly<{
  vehicleId: string;
  from: Date;
  to: Date;
}>;

export type PositionHistoryBackfillCheckpoint = Readonly<{
  id: string;
  vehicleId: string;
  externalDeviceId: number;
  rangeFrom: Date;
  rangeTo: Date;
  nextFrom: Date;
  status: PositionBackfillStatus;
}>;

export type PersistBackfillWindowInput = Readonly<{
  checkpointId: string;
  vehicleId: string;
  expectedNextFrom: Date;
  nextFrom: Date;
  completed: boolean;
  candidates: readonly PositionHistoryCandidate[];
}>;

export type PersistBackfillWindowResult = Readonly<{
  inserted: number;
  duplicates: number;
}>;

export interface PositionHistoryBackfillRepository {
  prepare(target: PositionHistoryBackfillTarget): Promise<PositionHistoryBackfillCheckpoint>;
  persistWindow(input: PersistBackfillWindowInput): Promise<PersistBackfillWindowResult>;
}

export type PositionHistoryBackfillClock = Readonly<{ now(): Date }>;
export type PositionHistoryBackfillSleeper = Readonly<{ sleep(durationMs: number): Promise<void> }>;

export type PositionHistoryBackfillResult = Readonly<{
  alreadyCompleted: boolean;
  resumed: boolean;
  requests: number;
  providerRows: number;
  historyCandidates: number;
  historyInserted: number;
  historyDuplicates: number;
  historySkippedInvalid: number;
  windowsCompleted: number;
  retries: number;
  rateLimitResponses: number;
  completed: boolean;
}>;

export type PositionHistoryBackfillRunOptions = Readonly<{
  maxWindows?: number;
  paceBeforeFirstWindow?: boolean;
}>;

export type PositionHistoryFleetBackfillTarget = Readonly<{
  from: Date;
  to: Date;
}>;

export type PositionHistoryFleetBackfillCheckpoint = Readonly<{
  nextFrom: Date;
  status: PositionBackfillStatus;
}>;

export type PositionHistoryFleetBackfillVehicle = Readonly<{
  vehicleId: string;
  externalDeviceId: number | null;
  providerDisabled: boolean;
  checkpoint: PositionHistoryFleetBackfillCheckpoint | null;
}>;

export interface PositionHistoryFleetBackfillRepository {
  inspect(target: PositionHistoryFleetBackfillTarget): Promise<readonly PositionHistoryFleetBackfillVehicle[]>;
}

export type PositionHistoryFleetBackfillRunOptions = Readonly<{
  maxVehicles?: number;
  maxWindows?: number;
  plan?: boolean;
  excludeProviderDisabled?: boolean;
}>;

export type PositionHistoryFleetBackfillResult = Readonly<{
  plan: boolean;
  vehiclesTotal: number;
  providerDisabledExcluded: number;
  vehiclesConsidered: number;
  vehiclesStarted: number;
  vehiclesCompleted: number;
  vehiclesAlreadyCompleted: number;
  vehiclesRemaining: number;
  pendingVehicles: number;
  partialVehicles: number;
  unmappedVehicles: number;
  estimatedRemainingWindows: number;
  windowsRequested: number;
  providerRequests: number;
  providerRows: number;
  candidates: number;
  inserted: number;
  duplicates: number;
  invalid: number;
  retries: number;
  rateLimitResponses: number;
  stoppedByBudget: boolean;
}>;
