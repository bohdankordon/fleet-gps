import { EquGpsForbiddenError, EquGpsHttpError, EquGpsNetworkError, EquGpsRateLimitError, EquGpsResponseValidationError, EquGpsTimeoutError, EquGpsUnauthorizedError, type EquGpsDiagnosticCode } from "@taxi-gps/equgps";
import { PositionHistoryBackfillProviderContractError } from "./position-history-historical-window.errors";

export type PositionHistoryHistoricalWindowProviderFailureDiagnostic = Readonly<{
  category: "network" | "timeout" | "rate_limit" | "http" | "permanent_http" | "contract" | "unknown";
  status?: number;
  retryable?: boolean;
  retryAfterPolicy?: "within_limit" | "exceeds_limit";
  diagnosticCode?: EquGpsDiagnosticCode;
}>;

const failureDiagnostic = Symbol("positionHistoryHistoricalWindowFailureDiagnostic");
const failureAccounting = Symbol("positionHistoryHistoricalWindowFailureAccounting");

export type PositionHistoryHistoricalWindowFailureAccounting = Readonly<{
  requests: number;
  retries: number;
  rateLimitResponses: number;
}>;

export function classifyPositionHistoryHistoricalWindowProviderFailure(error: unknown, options: Readonly<{ retryable?: boolean; maxRetryAfterMs: number }>): PositionHistoryHistoricalWindowProviderFailureDiagnostic {
  const retryable = options.retryable;
  if (error instanceof EquGpsNetworkError) return Object.freeze({ category: "network", ...(retryable === undefined ? {} : { retryable }) });
  if (error instanceof EquGpsTimeoutError) return Object.freeze({ category: "timeout", ...(retryable === undefined ? {} : { retryable }) });
  if (error instanceof EquGpsRateLimitError) {
    const retryAfterPolicy = error.retryAfterMs !== null ? (error.retryAfterMs <= options.maxRetryAfterMs ? "within_limit" : "exceeds_limit") : undefined;
    return Object.freeze({ category: "rate_limit", status: 429, ...(retryAfterPolicy === "exceeds_limit" ? { retryable: false } : retryable === undefined ? {} : { retryable }), ...(retryAfterPolicy === undefined ? {} : { retryAfterPolicy }) });
  }
  if (error instanceof EquGpsUnauthorizedError || error instanceof EquGpsForbiddenError) return Object.freeze({ category: "permanent_http", ...(error.status === undefined ? {} : { status: error.status }), retryable: false });
  if (error instanceof EquGpsHttpError) {
    const permanent = error.status === undefined || error.status < 500;
    return Object.freeze({ category: permanent ? "permanent_http" : "http", ...(error.status === undefined ? {} : { status: error.status }), ...(permanent ? { retryable: false } : retryable === undefined ? {} : { retryable }) });
  }
  if (error instanceof EquGpsResponseValidationError) return Object.freeze({ category: "contract", retryable: false, ...(error.diagnosticCode === undefined ? {} : { diagnosticCode: error.diagnosticCode }) });
  if (error instanceof PositionHistoryBackfillProviderContractError) return Object.freeze({ category: "contract", retryable: false });
  return Object.freeze({ category: "unknown" });
}

export function recordPositionHistoryHistoricalWindowProviderFailure(error: unknown, diagnostic: PositionHistoryHistoricalWindowProviderFailureDiagnostic): void {
  if ((typeof error !== "object" && typeof error !== "function") || error === null) return;
  try { Object.defineProperty(error, failureDiagnostic, { value: diagnostic, configurable: true }); }
  catch { /* Diagnostics must never alter provider failure propagation. */ }
}

export function recordedPositionHistoryHistoricalWindowProviderFailure(error: unknown): PositionHistoryHistoricalWindowProviderFailureDiagnostic | undefined {
  if ((typeof error !== "object" && typeof error !== "function") || error === null) return undefined;
  const value = (error as Record<PropertyKey, unknown>)[failureDiagnostic];
  return value !== undefined ? value as PositionHistoryHistoricalWindowProviderFailureDiagnostic : undefined;
}

export function recordPositionHistoryHistoricalWindowFailureAccounting(error: unknown, accounting: PositionHistoryHistoricalWindowFailureAccounting): void {
  if ((typeof error !== "object" && typeof error !== "function") || error === null) return;
  try { Object.defineProperty(error, failureAccounting, { value: Object.freeze({ ...accounting }), configurable: true }); }
  catch { /* Accounting must never alter provider failure propagation. */ }
}

export function recordedPositionHistoryHistoricalWindowFailureAccounting(error: unknown): PositionHistoryHistoricalWindowFailureAccounting | undefined {
  if ((typeof error !== "object" && typeof error !== "function") || error === null) return undefined;
  const value = (error as Record<PropertyKey, unknown>)[failureAccounting];
  return value !== undefined ? value as PositionHistoryHistoricalWindowFailureAccounting : undefined;
}
