export class PositionHistoryIngestionStatusUnauthorizedError extends Error {
  public constructor() {
    super("Position history ingestion status requires authentication");
    this.name = "PositionHistoryIngestionStatusUnauthorizedError";
  }
}

export class PositionHistoryIngestionStatusForbiddenError extends Error {
  public constructor() {
    super("Position history ingestion status requires history operator authority");
    this.name = "PositionHistoryIngestionStatusForbiddenError";
  }
}

export class PositionHistoryIngestionStatusUnavailableError extends Error {
  public constructor() {
    super("Position history ingestion status is unavailable");
    this.name = "PositionHistoryIngestionStatusUnavailableError";
  }
}
