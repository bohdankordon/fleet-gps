import type { PositionBackfillStatus, PositionHistoryReplayKind, PositionHistoryReplayRun, PositionHistoryReplayCheckpoint } from "../../generated/prisma/client";
import type { PositionHistoryCandidate } from "../position-history";

export type EnsurePositionHistoryReplayRunInput = Readonly<{
  kind: PositionHistoryReplayKind;
  generationAnchor: Date;
  rangeFrom: Date;
  rangeTo: Date;
}>;

export type EnsurePositionHistoryReplayCheckpointInput = Readonly<{
  vehicleId: string;
  rangeFrom: Date;
  rangeTo: Date;
}>;

export type PersistPositionHistoryReplayWindowInput = Readonly<{
  runId: string;
  leaseOwner: string;
  checkpointId: string;
  vehicleId: string;
  expectedNextFrom: Date;
  nextFrom: Date;
  candidates: readonly PositionHistoryCandidate[];
}>;

export type PersistPositionHistoryReplayWindowResult = Readonly<{
  inserted: number;
  duplicates: number;
  checkpointStatus: PositionBackfillStatus;
}>;

export type ClaimPositionHistoryReplayRunInput = Readonly<{
  runId: string;
  leaseOwner: string;
  now: Date;
  leaseExpiresAt: Date;
}>;

export type RenewPositionHistoryReplayRunLeaseInput = Readonly<{
  runId: string;
  leaseOwner: string;
  now: Date;
  leaseExpiresAt: Date;
}>;

export type OwnPositionHistoryReplayRunInput = Readonly<{
  runId: string;
  leaseOwner: string;
  now: Date;
}>;

export type OwnedPositionHistoryReplayRun = PositionHistoryReplayRun & Readonly<{
  leaseOwner: string;
  leaseExpiresAt: Date;
}>;

export interface PositionHistoryReplayRepository {
  ensureRun(input: EnsurePositionHistoryReplayRunInput): Promise<PositionHistoryReplayRun>;
  findRun(kind: PositionHistoryReplayKind, generationAnchor: Date): Promise<PositionHistoryReplayRun | null>;
  ensureCheckpoints(runId: string, checkpoints: readonly EnsurePositionHistoryReplayCheckpointInput[]): Promise<readonly PositionHistoryReplayCheckpoint[]>;
  listIncompleteCheckpoints(runId: string, limit: number): Promise<readonly PositionHistoryReplayCheckpoint[]>;
  persistReplayWindow(input: PersistPositionHistoryReplayWindowInput): Promise<PersistPositionHistoryReplayWindowResult>;
}
