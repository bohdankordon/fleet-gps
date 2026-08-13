import { parseAbsoluteTimestamp } from "../vehicle-track/vehicle-track-query-params";
import { POSITION_HISTORY_DURABLE_BROWSER_BUDGETS, type CreatePositionHistoryPopulationRunRequest } from "./position-history-population-run-admin.types";

export function parseCreatePositionHistoryPopulationRunRequest(value: unknown): CreatePositionHistoryPopulationRunRequest | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 3 || !Object.hasOwn(record, "to") || !Object.hasOwn(record, "windowBudget") || !Object.hasOwn(record, "excludeProviderDisabled")) return null;
  const to = parseAbsoluteTimestamp(record.to);
  if (to === null || !POSITION_HISTORY_DURABLE_BROWSER_BUDGETS.includes(record.windowBudget as never) || typeof record.excludeProviderDisabled !== "boolean") return null;
  return Object.freeze({ to, windowBudget: record.windowBudget as CreatePositionHistoryPopulationRunRequest["windowBudget"], excludeProviderDisabled: record.excludeProviderDisabled });
}
