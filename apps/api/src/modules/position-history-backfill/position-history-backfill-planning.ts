import { PositionBackfillStatus } from "../../generated/prisma/client";
import { POSITION_HISTORY_BACKFILL_WINDOW_MS } from "./position-history-backfill.constants";

export type PositionHistoryBackfillWindowPlan = Readonly<{
  rangeFrom: Date;
  rangeTo: Date;
  status: PositionBackfillStatus | null;
  nextFrom: Date | null;
}>;

export function estimatePositionHistoryBackfillRemainingWindows(plan: PositionHistoryBackfillWindowPlan): number {
  if (plan.status === PositionBackfillStatus.COMPLETED) return 0;
  const cursor = plan.nextFrom ?? plan.rangeFrom;
  return Math.max(0, Math.ceil((plan.rangeTo.getTime() - cursor.getTime()) / POSITION_HISTORY_BACKFILL_WINDOW_MS));
}
