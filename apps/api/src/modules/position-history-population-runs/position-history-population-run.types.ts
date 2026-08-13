import { PositionHistoryPopulationRunInitiatorType, type PositionHistoryPopulationRun } from "../../generated/prisma/client";

type CreatePositionHistoryPopulationRunFacts = Readonly<{
  to: Date;
  excludeProviderDisabled: boolean;
  windowBudget: number;
}>;

export type CreatePositionHistoryPopulationRunInput =
  | (CreatePositionHistoryPopulationRunFacts & Readonly<{
      initiatorType: typeof PositionHistoryPopulationRunInitiatorType.USER;
      requestedByUserId: string;
      requestedByLoginSnapshot: string;
    }>)
  | (CreatePositionHistoryPopulationRunFacts & Readonly<{
      initiatorType: typeof PositionHistoryPopulationRunInitiatorType.SYSTEM;
      requestedByUserId?: never;
      requestedByLoginSnapshot?: never;
    }>);

export type PositionHistoryPopulationRunWorkerResult = Readonly<{
  outcome: "NO_WORK" | "LOCK_UNAVAILABLE" | "SUCCEEDED" | "FAILED" | "STALE";
  runId: string | null;
  committedWindows: number | null;
}>;

export type PositionHistoryPopulationRunClock = Readonly<{ now(): Date }>;
export type PositionHistoryPopulationRunHeartbeatScheduler = Readonly<{
  start(work: () => Promise<void>, intervalMs: number): () => void;
}>;

export type ClaimedPositionHistoryPopulationRun = PositionHistoryPopulationRun & Readonly<{ leaseOwner: string; leaseExpiresAt: Date }>;
