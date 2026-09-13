export { PositionHistoryBackfillProviderContractError, PositionHistoryBackfillTargetError } from "../position-history-historical-window";

export class PositionHistoryBackfillVehicleNotFoundError extends Error {
  public constructor() { super("Position history backfill vehicle was not found."); this.name = "PositionHistoryBackfillVehicleNotFoundError"; }
}

export class PositionHistoryBackfillConcurrentProgressError extends Error {
  public constructor() { super("Position history backfill checkpoint changed concurrently."); this.name = "PositionHistoryBackfillConcurrentProgressError"; }
}

export class PositionHistoryBackfillDurableAccountingError extends Error {
  public constructor() { super("Durable population run accounting ownership or budget changed."); this.name = "PositionHistoryBackfillDurableAccountingError"; }
}
