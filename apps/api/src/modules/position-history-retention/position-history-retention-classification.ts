import type { PositionHistoryRetentionCheckpointClass } from "./position-history-retention.types";

/** Classifies the existing Stage 14 closed/inclusive checkpoint target [rangeFrom, rangeTo]. */
export function classifyInclusivePositionHistoryCheckpoint(rangeFrom: Date, rangeTo: Date, policyCutoff: Date): PositionHistoryRetentionCheckpointClass {
  const from = rangeFrom.getTime();
  const to = rangeTo.getTime();
  const cutoff = policyCutoff.getTime();
  if (![from, to, cutoff].every(Number.isFinite) || from > to) throw new Error("Invalid inclusive position-history checkpoint interval");
  if (to < cutoff) return "FULLY_OBSOLETE";
  if (from < cutoff) return "BOUNDARY_OVERLAP";
  return "PROTECTED";
}
