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
  WebRunsClient,
  WebVehicleDetailsClient,
  WebSpeedEventsClient,
  WebRouteClient,
  VehicleTrip,
  Location,
  ExternalSpeedReport,
  RoutePoint,
} from "./contracts/client-contracts";
export type { HttpRequest, HttpResponse, HttpTransport } from "./contracts/http";
export { SessionTokenProvider, type CreateSessionToken } from "./auth/session-token-provider";
export { executeReadOnlyWithSessionToken, type ReadOnlyWebOperation } from "./auth/with-session-token";
export {
  EquGpsError,
  EquGpsConfigurationError,
  EquGpsForbiddenError,
  EquGpsNetworkError,
  EquGpsRateLimitError,
  EquGpsResponseValidationError,
  EquGpsTimeoutError,
  EquGpsUnauthorizedError,
  EquGpsHttpError,
} from "./errors/equgps-errors";
export type { EquGpsSafeOperation, EquGpsDiagnosticCode } from "./errors/equgps-errors";
export { FetchHttpTransport } from "./transport/fetch-http-transport";
export { createOfficialEquGpsClient, createWebRunsClient, createWebVehicleDetailsClient, createWebSpeedEventsClient, createWebRouteClient } from "./factories";
