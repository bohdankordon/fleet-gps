export type PositionHistoryHorizonPopulationOptions = Readonly<{
  maxWindows: number;
  excludeProviderDisabled?: boolean;
}>;

export type PositionHistoryHorizonPopulationProgress = Readonly<{
  horizonFrom: Date;
  horizonTo: Date;
  policyDays: number;
  slicesTotal: number;
  slicesVisited: number;
  slicesAlreadyComplete: number;
  providerDisabledExcluded: number;
  windowsRequested: number;
  providerRequests: number;
  providerRows: number;
  candidates: number;
  inserted: number;
  duplicates: number;
  invalid: number;
  retries: number;
  rateLimitResponses: number;
  stoppedByBudget: boolean;
  horizonComplete: boolean;
  currentSliceFrom: Date | null;
  currentSliceTo: Date | null;
}>;

export type PositionHistoryHorizonPopulationResult = PositionHistoryHorizonPopulationProgress;
