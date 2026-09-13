import { canonicalPositionHistoryMaintenanceAnchor } from "../position-history-population-runs/position-history-maintenance-anchor";
import { POSITION_HISTORY_HORIZON_POLICY } from "./position-history-horizon.policy";

/** The beginning of the active local history guarantee at a given instant. */
export function positionHistoryPolicyFloor(instant: Date): Date {
  const anchor = canonicalPositionHistoryMaintenanceAnchor(instant);
  return new Date(anchor.getTime() - POSITION_HISTORY_HORIZON_POLICY.durationMs);
}
