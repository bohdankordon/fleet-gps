export class PositionHistoryBackfillTargetError extends Error {
  public constructor() { super("Invalid position history backfill target."); this.name = "PositionHistoryBackfillTargetError"; }
}

export class PositionHistoryBackfillVehicleNotFoundError extends Error {
  public constructor() { super("Position history backfill vehicle was not found."); this.name = "PositionHistoryBackfillVehicleNotFoundError"; }
}

export class PositionHistoryBackfillProviderContractError extends Error {
  public constructor() { super("Historical positions violate the bounded provider contract."); this.name = "PositionHistoryBackfillProviderContractError"; }
}

export class PositionHistoryBackfillConcurrentProgressError extends Error {
  public constructor() { super("Position history backfill checkpoint changed concurrently."); this.name = "PositionHistoryBackfillConcurrentProgressError"; }
}
