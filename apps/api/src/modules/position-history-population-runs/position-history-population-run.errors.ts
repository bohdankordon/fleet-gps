export class PositionHistoryPopulationRunConflictError extends Error {
  public constructor() { super("A durable position history population run is already active."); this.name = "PositionHistoryPopulationRunConflictError"; }
}

export class PositionHistoryPopulationRunInputError extends Error {
  public constructor() { super("Invalid durable position history population run input."); this.name = "PositionHistoryPopulationRunInputError"; }
}
