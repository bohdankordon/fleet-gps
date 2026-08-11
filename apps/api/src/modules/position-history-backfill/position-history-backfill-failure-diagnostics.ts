import { EquGpsForbiddenError, EquGpsHttpError, EquGpsNetworkError, EquGpsRateLimitError, EquGpsResponseValidationError, EquGpsTimeoutError, EquGpsUnauthorizedError, type EquGpsDiagnosticCode } from "@taxi-gps/equgps";
import { PositionHistoryBackfillProviderContractError } from "./position-history-backfill.errors";

export type PositionHistoryBackfillProviderFailureDiagnostic = Readonly<{
  category: "network" | "timeout" | "rate_limit" | "http" | "permanent_http" | "contract" | "unknown";
  status?: number;
  retryable?: boolean;
  retryAfterPolicy?: "within_limit" | "exceeds_limit";
  diagnosticCode?: EquGpsDiagnosticCode;
}>;

const failureDiagnostic = Symbol("positionHistoryBackfillFailureDiagnostic");

export function classifyPositionHistoryBackfillProviderFailure(error: unknown, options: Readonly<{ retryable?: boolean; maxRetryAfterMs: number }> ): PositionHistoryBackfillProviderFailureDiagnostic {
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

export function recordPositionHistoryBackfillProviderFailure(error: unknown, diagnostic: PositionHistoryBackfillProviderFailureDiagnostic): void {
  if ((typeof error !== "object" && typeof error !== "function") || error === null) return;
  try { Object.defineProperty(error, failureDiagnostic, { value: diagnostic, configurable: true }); }
  catch { /* Diagnostics must never alter provider failure propagation. */ }
}

export function recordedPositionHistoryBackfillProviderFailure(error: unknown): PositionHistoryBackfillProviderFailureDiagnostic | undefined {
  if ((typeof error !== "object" && typeof error !== "function") || error === null) return undefined;
  const value = (error as Record<PropertyKey, unknown>)[failureDiagnostic];
  return value !== undefined ? value as PositionHistoryBackfillProviderFailureDiagnostic : undefined;
}
