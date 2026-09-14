import type { PositionHistoryCandidate } from "../position-history";

export type VehicleHistoryIngestionCursor = Readonly<{
  vehicleId: string;
  coverageFrom: Date;
  confirmedThrough: Date;
  createdAt: Date;
  updatedAt: Date;
}>;

export type PersistContiguousHistoryResultInput = Readonly<{
  vehicleId: string;
  expectedCoverageFrom: Date;
  expectedConfirmedThrough: Date;
  nextConfirmedThrough: Date;
  candidates: readonly PositionHistoryCandidate[];
}>;

export type PersistContiguousHistoryResult = Readonly<{
  inserted: number;
  duplicates: number;
}>;

export interface PositionHistoryIngestionCursorRepository {
  ensureCursor(vehicleId: string, policyFloor: Date): Promise<VehicleHistoryIngestionCursor>;
  findCursor(vehicleId: string): Promise<VehicleHistoryIngestionCursor | null>;
  persistContiguousResult(input: PersistContiguousHistoryResultInput): Promise<PersistContiguousHistoryResult>;
}
