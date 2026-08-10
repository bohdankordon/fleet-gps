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
}>;
