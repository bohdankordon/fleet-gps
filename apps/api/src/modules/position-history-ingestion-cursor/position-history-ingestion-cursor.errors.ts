export class PositionHistoryIngestionCursorVehicleNotFoundError extends Error {
  public constructor() {
    super("Position history ingestion cursor vehicle was not found.");
    this.name = "PositionHistoryIngestionCursorVehicleNotFoundError";
  }
}

export class PositionHistoryIngestionCursorStaleProgressError extends Error {
  public constructor() {
    super("Position history ingestion cursor changed concurrently.");
    this.name = "PositionHistoryIngestionCursorStaleProgressError";
  }
}

export class PositionHistoryIngestionCursorInvalidAdvanceError extends Error {
  public constructor() {
    super("Position history ingestion cursor advancement is invalid.");
    this.name = "PositionHistoryIngestionCursorInvalidAdvanceError";
  }
}
