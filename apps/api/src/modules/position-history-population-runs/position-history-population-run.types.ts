import type { PositionHistoryPopulationRun, PositionHistoryPopulationRunInitiatorType } from "../../generated/prisma/client";

export type CreatePositionHistoryPopulationRunInput = Readonly<{
  initiatorType: PositionHistoryPopulationRunInitiatorType;
  requestedByUserId?: string;
  requestedByLoginSnapshot?: string;
  to: Date;
  excludeProviderDisabled: boolean;
  windowBudget: number;
}>;

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
