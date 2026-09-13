import type { PositionHistoryCandidate } from "../position-history";

export type PositionHistoryHistoricalWindowRequest = Readonly<{
  externalDeviceId: number;
  from: Date;
  to: Date;
}>;

export type PositionHistoryHistoricalWindowReadOptions = Readonly<{
  beforeRequestStart?: () => Promise<void>;
}>;

export type PositionHistoryHistoricalWindowResult = Readonly<{
  fetchFrom: Date;
  fetchTo: Date;
  fetchedAt: Date;
  providerRows: number;
  candidates: readonly PositionHistoryCandidate[];
  skippedInvalid: number;
  requests: number;
  retries: number;
  rateLimitResponses: number;
}>;

export type PositionHistoryHistoricalWindowClock = Readonly<{ now(): Date }>;
export type PositionHistoryHistoricalWindowSleeper = Readonly<{ sleep(durationMs: number): Promise<void> }>;
