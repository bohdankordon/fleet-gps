import { parseAbsoluteTimestamp } from "../vehicle-track/vehicle-track-query-params";
import { POSITION_HISTORY_BROWSER_WINDOW_BUDGETS, type PositionHistoryBrowserWindowBudget, type PositionHistoryHorizonExecutionRequest } from "./position-history-horizon-execution.types";

export function parsePositionHistoryHorizonExecutionRequest(value: unknown): PositionHistoryHorizonExecutionRequest | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const keys = Object.keys(body);
  if (keys.length !== 3 || keys.some((key) => !["to", "maxWindows", "excludeProviderDisabled"].includes(key))) return null;
  const to = parseAbsoluteTimestamp(body.to);
  if (!to || !POSITION_HISTORY_BROWSER_WINDOW_BUDGETS.includes(body.maxWindows as PositionHistoryBrowserWindowBudget) || typeof body.excludeProviderDisabled !== "boolean") return null;
  return Object.freeze({ requestedTo: body.to as string, to, maxWindows: body.maxWindows as PositionHistoryBrowserWindowBudget, excludeProviderDisabled: body.excludeProviderDisabled });
}
