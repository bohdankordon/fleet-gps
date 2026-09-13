export class PositionHistoryReplayInputError extends Error {
  public constructor() { super("Invalid position history replay input"); this.name = "PositionHistoryReplayInputError"; }
}

export class PositionHistoryReplayGenerationConflictError extends Error {
  public constructor() { super("Position history replay generation target conflicts with durable state"); this.name = "PositionHistoryReplayGenerationConflictError"; }
}

export class PositionHistoryReplayRunNotFoundError extends Error {
  public constructor() { super("Position history replay run was not found"); this.name = "PositionHistoryReplayRunNotFoundError"; }
}

export class PositionHistoryReplayCheckpointInitializationError extends Error {
  public constructor() { super("Position history replay checkpoints cannot be initialized"); this.name = "PositionHistoryReplayCheckpointInitializationError"; }
}

export class PositionHistoryReplayCheckpointStaleProgressError extends Error {
  public constructor() { super("Position history replay checkpoint progress is stale"); this.name = "PositionHistoryReplayCheckpointStaleProgressError"; }
}
