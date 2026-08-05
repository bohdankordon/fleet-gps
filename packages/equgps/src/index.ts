export {
  equGpsConfigSchema,
  parseEquGpsConfig,
  safeConfigSummary,
  type EquGpsConfig,
  type EquGpsConfigInput,
  type EquGpsSafeConfigSummary,
} from "./config/equgps-config";
export type {
  DailyRun,
  EquGpsDevice,
  EquGpsPosition,
  ExternalSpeedEvent,
  HistoricalPositionsParams,
  OfficialEquGpsClient,
  SessionToken,
  VehicleDayDetails,
  VehicleDayParams,
  VehicleRoute,
  WebEquGpsClient,
} from "./contracts/client-contracts";
export type { HttpRequest, HttpResponse, HttpTransport } from "./contracts/http";
export { SessionTokenProvider, type CreateSessionToken } from "./auth/session-token-provider";
export { executeReadOnlyWithSessionToken, type ReadOnlyWebOperation } from "./auth/with-session-token";
export {
  EquGpsConfigurationError,
  EquGpsForbiddenError,
  EquGpsNetworkError,
  EquGpsRateLimitError,
  EquGpsResponseValidationError,
  EquGpsTimeoutError,
  EquGpsUnauthorizedError,
} from "./errors/equgps-errors";
export type { EquGpsSafeOperation } from "./errors/equgps-errors";
