/** Legacy public name retained while the reusable core takes ownership. */
export class PositionHistoryBackfillProviderContractError extends Error {
  public constructor() { super("Historical positions violate the bounded provider contract."); this.name = "PositionHistoryBackfillProviderContractError"; }
}

/** Safe typed density signal used only for deterministic adaptive subdivision. */
export class PositionHistoryHistoricalWindowOversizedError extends PositionHistoryBackfillProviderContractError {
  public constructor() { super(); this.name = "PositionHistoryHistoricalWindowOversizedError"; }
}

/** Legacy public name retained for invalid backfill targets and core requests. */
export class PositionHistoryBackfillTargetError extends Error {
  public constructor() { super("Invalid position history backfill target."); this.name = "PositionHistoryBackfillTargetError"; }
}
