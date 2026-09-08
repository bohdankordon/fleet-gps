import type { PositionHistoryPopulationRun, PositionHistoryPopulationRunInitiatorType, PositionHistoryPopulationRunStatus } from "../../generated/prisma/client";

export const POSITION_HISTORY_DURABLE_BROWSER_BUDGETS = Object.freeze([500, 1_000, 5_000] as const);
export type PositionHistoryDurableBrowserBudget = (typeof POSITION_HISTORY_DURABLE_BROWSER_BUDGETS)[number];

export type CreatePositionHistoryPopulationRunRequest = Readonly<{
  to: Date;
  windowBudget: PositionHistoryDurableBrowserBudget;
  excludeProviderDisabled: boolean;
}>;

export type SafePositionHistoryPopulationRun = Readonly<{
  id: string;
  status: PositionHistoryPopulationRunStatus;
  initiatorType: PositionHistoryPopulationRunInitiatorType;
  to: string;
  excludeProviderDisabled: boolean;
  windowBudget: number;
  committedWindows: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  failureCategory: "EXECUTION" | "WORKER" | "UNKNOWN" | null;
}>;

export type PositionHistoryPopulationRunSafeSource = Pick<PositionHistoryPopulationRun,
  "id" | "status" | "initiatorType" | "to" | "excludeProviderDisabled" | "windowBudget" | "committedWindows" | "createdAt" | "startedAt" | "finishedAt" | "safeFailureCode"
>;

// Explicit no-active-run HTTP contract (Phase 0 correctness).
// SUCCESS + NO ACTIVE RUN is { active: null } as valid JSON (HTTP 200),
// distinct from READ FAILURE (non-2xx / transport / contract error).
// Never rely on framework-specific null/empty-body behavior.
export type ActivePositionHistoryPopulationRunResponse = Readonly<{
  active: SafePositionHistoryPopulationRun | null;
}>;
