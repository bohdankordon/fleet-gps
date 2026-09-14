import { POSITION_HISTORY_HISTORICAL_WINDOW_MAX_DURATION_MS } from "../position-history-historical-window";
import { POSITION_HISTORY_CONTINUOUS_REPLAY_OVERLAP_MS } from "./position-history-continuous-ingestion.constants";
import type { VehicleHistoryIngestionCursor } from "../position-history-ingestion-cursor";
import { POSITION_HISTORY_ADAPTIVE_FETCH_DURATIONS_MS } from "./position-history-replay-orchestration.constants";

export type PositionHistoryContinuousFetchProgressRange = Readonly<{
  fetchFrom: Date;
  fetchTo: Date;
  expectedCoverageFrom: Date;
  expectedConfirmedThrough: Date;
  nextConfirmedThrough: Date;
}>;

export function recentTailRange(safeNow: Date): Readonly<{ fetchFrom: Date; fetchTo: Date }> {
  return Object.freeze({ fetchFrom: new Date(safeNow.getTime() - POSITION_HISTORY_CONTINUOUS_REPLAY_OVERLAP_MS), fetchTo: new Date(safeNow.getTime()) });
}
export function contiguousBacklogRange(cursor: VehicleHistoryIngestionCursor, safeNow: Date): PositionHistoryContinuousFetchProgressRange | null {
  return contiguousBacklogRanges(cursor, safeNow)[0] ?? null;
}

export function contiguousBacklogRanges(cursor: VehicleHistoryIngestionCursor, safeNow: Date): readonly PositionHistoryContinuousFetchProgressRange[] {
  const confirmed = cursor.confirmedThrough.getTime();
  if (confirmed >= safeNow.getTime()) return Object.freeze([]);
  const fetchFrom = Math.max(cursor.coverageFrom.getTime(), confirmed - POSITION_HISTORY_CONTINUOUS_REPLAY_OVERLAP_MS);
  const ranges: PositionHistoryContinuousFetchProgressRange[] = [];
  let previousNext = -1;
  for (const fetchDuration of POSITION_HISTORY_ADAPTIVE_FETCH_DURATIONS_MS) {
    const progressDuration = fetchDuration - POSITION_HISTORY_CONTINUOUS_REPLAY_OVERLAP_MS;
    const next = Math.min(confirmed + progressDuration, safeNow.getTime());
    if (next <= confirmed || next === previousNext) continue;
    if (next - fetchFrom > POSITION_HISTORY_HISTORICAL_WINDOW_MAX_DURATION_MS) throw new Error("Continuous history range exceeded the historical-window limit.");
    ranges.push(Object.freeze({
      fetchFrom: new Date(fetchFrom),
      fetchTo: new Date(next),
      expectedCoverageFrom: new Date(cursor.coverageFrom.getTime()),
      expectedConfirmedThrough: new Date(confirmed),
      nextConfirmedThrough: new Date(next),
    }));
    previousNext = next;
  }
  return Object.freeze(ranges);
}
