import type { PositionHistoryReplayKind } from "../../generated/prisma/client";

export type PositionHistoryReplayTarget = Readonly<{
  kind: PositionHistoryReplayKind;
  generationAnchor: Date;
  rangeFrom: Date;
  rangeTo: Date;
}>;

export type PositionHistoryReplayQuantumResult = Readonly<{
  kind: PositionHistoryReplayKind;
  outcome: "NO_WORK" | "LOCK_UNAVAILABLE" | "COMPLETED_WINDOW" | "COMPLETED_RUN" | "YIELDED" | "FAILED" | "STALE";
  generationAnchor: Date | null;
  requests: number;
  providerRows: number;
  inserted: number;
  duplicates: number;
  invalid: number;
  retries: number;
  rateLimitResponses: number;
  checkpointWindowsCompleted: number;
  policyRetiredPrefixes: number;
  checkpointsRemaining: number | null;
}>;

export type PositionHistoryReplayHeartbeatScheduler = Readonly<{
  start(work: () => Promise<void>, intervalMs: number): () => void;
}>;
