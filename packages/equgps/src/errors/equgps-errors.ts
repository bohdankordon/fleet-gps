export type EquGpsSafeOperation =
  | "createSession"
  | "getDevices"
  | "getLatestPositions"
  | "getHistoricalPositions"
  | "getRuns"
  | "getMode1"
  | "getMode2"
  | "getRoute"
  | undefined;

export abstract class EquGpsError extends Error {
  public readonly operation: EquGpsSafeOperation;
  public readonly status: number | undefined;

  protected constructor(message: string, operation?: EquGpsSafeOperation, status?: number) {
    super(message);
    this.name = new.target.name;
    this.operation = operation;
    this.status = status;
  }
}

export class EquGpsConfigurationError extends EquGpsError {
  public constructor(public readonly issues: readonly string[]) {
    super("Invalid eQuGPS package configuration.");
  }
}

export class EquGpsUnauthorizedError extends EquGpsError {
  public constructor(operation?: EquGpsSafeOperation) {
    super("eQuGPS rejected authentication.", operation, 401);
  }
}

export class EquGpsForbiddenError extends EquGpsError {
  public constructor(operation?: EquGpsSafeOperation) {
    super("eQuGPS denied access.", operation, 403);
  }
}

export class EquGpsRateLimitError extends EquGpsError {
  public constructor(operation?: EquGpsSafeOperation) {
    super("eQuGPS rate limit reached.", operation, 429);
  }
}

export class EquGpsTimeoutError extends EquGpsError {
  public constructor(operation?: EquGpsSafeOperation) {
    super("eQuGPS request timed out.", operation);
  }
}

export class EquGpsNetworkError extends EquGpsError {
  public constructor(operation?: EquGpsSafeOperation) {
    super("Unable to reach eQuGPS.", operation);
  }
}

export class EquGpsResponseValidationError extends EquGpsError {
  public constructor(operation?: EquGpsSafeOperation) {
    super("eQuGPS response does not match the expected contract.", operation);
  }
}
