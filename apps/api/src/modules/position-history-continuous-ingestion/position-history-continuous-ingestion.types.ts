import type { PositionHistoryCandidate } from "../position-history";
import type { VehicleHistoryIngestionCursor } from "../position-history-ingestion-cursor";

export type PositionHistoryContinuousLane = "RECENT_TAIL" | "CONTIGUOUS_BACKLOG";

export type PositionHistoryContinuousVehicle = Readonly<{
  vehicleId: string;
  externalDeviceId: number;
  disabled: boolean;
}>;
export type PositionHistoryContinuousVehicleState = Readonly<{
  vehicle: PositionHistoryContinuousVehicle;
  cursor: VehicleHistoryIngestionCursor;
}>;

export type PositionHistoryContinuousPersistResult = Readonly<{ inserted: number; duplicates: number }>;

export interface PositionHistoryContinuousIngestionRepository {
  listMappedVehicles(): Promise<readonly PositionHistoryContinuousVehicle[]>;
  persistReplay(vehicleId: string, candidates: readonly PositionHistoryCandidate[]): Promise<PositionHistoryContinuousPersistResult>;
}

export type PositionHistoryContinuousClock = Readonly<{ now(): Date }>;
export type PositionHistoryContinuousSleeper = Readonly<{ sleep(durationMs: number): Promise<void> }>;

export type PositionHistoryContinuousCycleResult = Readonly<{
  vehicles: number;
  requests: number;
  providerRows: number;
  inserted: number;
  duplicates: number;
  invalid: number;
  retries: number;
  rateLimitResponses: number;
  cursorAdvancements: number;
  recentTailCompleted: number;
  backlogCompleted: number;
  providerBlocked: number;
  failedWork: number;
  lockUnavailable: number;
}>;

export type PositionHistoryContinuousStatus = Readonly<PositionHistoryContinuousCycleResult & {
  enabled: boolean;
  running: boolean;
  cyclesStarted: number;
  cyclesCompleted: number;
}>;

export type PositionHistoryContinuousTimer = Readonly<{
  addTimeout(name: string, callback: () => void, milliseconds: number): void;
  addInterval(name: string, callback: () => void, milliseconds: number): void;
  deleteTimeout(name: string): void;
  deleteInterval(name: string): void;
}>;
