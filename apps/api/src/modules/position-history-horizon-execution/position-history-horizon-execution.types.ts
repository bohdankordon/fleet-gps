import type { PositionHistoryHorizonPopulationResult } from "../position-history-horizon-population/position-history-horizon-population.types";

export const POSITION_HISTORY_BROWSER_WINDOW_BUDGETS = Object.freeze([6, 12, 24] as const);
export type PositionHistoryBrowserWindowBudget = (typeof POSITION_HISTORY_BROWSER_WINDOW_BUDGETS)[number];

export type PositionHistoryHorizonExecutionRequest = Readonly<{
  requestedTo: string;
  to: Date;
  maxWindows: PositionHistoryBrowserWindowBudget;
  excludeProviderDisabled: boolean;
}>;

export type PositionHistoryHorizonExecutionResponse = Readonly<{
  to: string;
  maxWindows: PositionHistoryBrowserWindowBudget;
  excludeProviderDisabled: boolean;
  committedWindows: number;
  providerRequests: number;
  rowsReceived: number;
  candidates: number;
  inserted: number;
  duplicates: number;
  invalid: number;
  retries: number;
  rateLimits: number;
  slicesTotal: number;
  slicesVisited: number;
  slicesAlreadyComplete: number;
  providerDisabledExcluded: number;
  stoppedByBudget: boolean;
  horizonComplete: boolean;
}>;

export function toPositionHistoryHorizonExecutionResponse(request: PositionHistoryHorizonExecutionRequest, result: PositionHistoryHorizonPopulationResult): PositionHistoryHorizonExecutionResponse {
  return Object.freeze({
    to: request.requestedTo,
    maxWindows: request.maxWindows,
    excludeProviderDisabled: request.excludeProviderDisabled,
    committedWindows: result.windowsRequested,
    providerRequests: result.providerRequests,
    rowsReceived: result.providerRows,
    candidates: result.candidates,
    inserted: result.inserted,
    duplicates: result.duplicates,
    invalid: result.invalid,
    retries: result.retries,
    rateLimits: result.rateLimitResponses,
    slicesTotal: result.slicesTotal,
    slicesVisited: result.slicesVisited,
    slicesAlreadyComplete: result.slicesAlreadyComplete,
    providerDisabledExcluded: result.providerDisabledExcluded,
    stoppedByBudget: result.stoppedByBudget,
    horizonComplete: result.horizonComplete,
  });
}
