import type { TripAnalysisResponse } from "./trip-analysis-contract";

export type TripAnalysisPresentationState = "NO_OBSERVATIONS" | "EMPTY_CHRONOLOGY" | "GAPS_ONLY" | "NORMAL";

type TripAnalysisCounts = Pick<TripAnalysisResponse["summary"], "rawObservationCount" | "tripCount" | "stopCount" | "gapCount">;

export function classifyTripAnalysisPresentation(summary: TripAnalysisCounts): TripAnalysisPresentationState {
  if (summary.rawObservationCount === 0) return "NO_OBSERVATIONS";
  if (summary.tripCount > 0 || summary.stopCount > 0) return "NORMAL";
  if (summary.gapCount > 0) return "GAPS_ONLY";
  return "EMPTY_CHRONOLOGY";
}
