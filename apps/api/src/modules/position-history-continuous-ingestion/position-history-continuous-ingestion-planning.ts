import { POSITION_HISTORY_HISTORICAL_WINDOW_MAX_DURATION_MS } from "../position-history-historical-window";
import { POSITION_HISTORY_CONTINUOUS_PROGRESS_QUANTUM_MS, POSITION_HISTORY_CONTINUOUS_REPLAY_OVERLAP_MS } from "./position-history-continuous-ingestion.constants";
import type { VehicleHistoryIngestionCursor } from "../position-history-ingestion-cursor";

export type PositionHistoryContinuousFetchProgressRange = Readonly<{
  fetchFrom: Date;
  fetchTo: Date;
  expectedConfirmedThrough: Date;
  nextConfirmedThrough: Date;
}>;

export function recentTailRange(safeNow: Date): Readonly<{ fetchFrom: Date; fetchTo: Date }> {
  return Object.freeze({ fetchFrom: new Date(safeNow.getTime() - POSITION_HISTORY_CONTINUOUS_REPLAY_OVERLAP_MS), fetchTo: new Date(safeNow.getTime()) });
}
export function contiguousBacklogRange(cursor: VehicleHistoryIngestionCursor, safeNow: Date): PositionHistoryContinuousFetchProgressRange | null {
  const confirmed = cursor.confirmedThrough.getTime();
  if (confirmed >= safeNow.getTime()) return null;
  const next = Math.min(confirmed + POSITION_HISTORY_CONTINUOUS_PROGRESS_QUANTUM_MS, safeNow.getTime());
  const fetchFrom = Math.max(cursor.coverageFrom.getTime(), confirmed - POSITION_HISTORY_CONTINUOUS_REPLAY_OVERLAP_MS);
  if (next - fetchFrom > POSITION_HISTORY_HISTORICAL_WINDOW_MAX_DURATION_MS) throw new Error("Continuous history range exceeded the historical-window limit.");
  return Object.freeze({
    fetchFrom: new Date(fetchFrom),
    fetchTo: new Date(next),
    expectedConfirmedThrough: new Date(confirmed),
    nextConfirmedThrough: new Date(next),
  });
}
