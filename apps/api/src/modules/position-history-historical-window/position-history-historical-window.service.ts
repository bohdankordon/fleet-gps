import { Inject, Injectable } from "@nestjs/common";
import { EquGpsHttpError, EquGpsNetworkError, EquGpsRateLimitError, EquGpsTimeoutError, type EquGpsPosition } from "@taxi-gps/equgps";
import { PositionIngestionSource } from "../../generated/prisma/client";
import { EquGpsGatewayService } from "../equgps/equgps-gateway.service";
import { mapEquGpsPositionToHistoryInput, normalizePositionHistoryCandidate, type PositionHistoryCandidate } from "../position-history";
import { POSITION_HISTORY_HISTORICAL_WINDOW_MAX_ATTEMPTS, POSITION_HISTORY_HISTORICAL_WINDOW_MAX_DURATION_MS, POSITION_HISTORY_HISTORICAL_WINDOW_MAX_RETRY_AFTER_MS, POSITION_HISTORY_HISTORICAL_WINDOW_MAX_ROWS } from "./position-history-historical-window.constants";
import { PositionHistoryBackfillProviderContractError, PositionHistoryBackfillTargetError } from "./position-history-historical-window.errors";
import { classifyPositionHistoryHistoricalWindowProviderFailure, recordPositionHistoryHistoricalWindowFailureAccounting, recordPositionHistoryHistoricalWindowProviderFailure } from "./position-history-historical-window-failure-diagnostics";
import { POSITION_HISTORY_HISTORICAL_WINDOW_CLOCK, POSITION_HISTORY_HISTORICAL_WINDOW_SLEEPER } from "./position-history-historical-window.tokens";
import type { PositionHistoryHistoricalWindowClock, PositionHistoryHistoricalWindowReadOptions, PositionHistoryHistoricalWindowRequest, PositionHistoryHistoricalWindowResult, PositionHistoryHistoricalWindowSleeper } from "./position-history-historical-window.types";

function validRequest(request: PositionHistoryHistoricalWindowRequest): boolean {
  const from = request.from.getTime();
  const to = request.to.getTime();
  return Number.isInteger(request.externalDeviceId) && request.externalDeviceId > 0 && Number.isFinite(from) && Number.isFinite(to) && from < to && to - from <= POSITION_HISTORY_HISTORICAL_WINDOW_MAX_DURATION_MS;
}

function transient(error: unknown): boolean {
  return error instanceof EquGpsNetworkError
    || error instanceof EquGpsTimeoutError
    || error instanceof EquGpsRateLimitError
    || (error instanceof EquGpsHttpError && error.status !== undefined && error.status >= 500);
}

@Injectable()
export class PositionHistoryHistoricalWindowService {
  public constructor(
    private readonly gateway: EquGpsGatewayService,
    @Inject(POSITION_HISTORY_HISTORICAL_WINDOW_CLOCK) private readonly clock: PositionHistoryHistoricalWindowClock,
    @Inject(POSITION_HISTORY_HISTORICAL_WINDOW_SLEEPER) private readonly sleeper: PositionHistoryHistoricalWindowSleeper,
  ) {}

  public async read(request: PositionHistoryHistoricalWindowRequest, options: PositionHistoryHistoricalWindowReadOptions = {}): Promise<PositionHistoryHistoricalWindowResult> {
    if (!validRequest(request)) throw new PositionHistoryBackfillTargetError();
    const response = await this.fetch(request, options);
    if (response.positions.length > POSITION_HISTORY_HISTORICAL_WINDOW_MAX_ROWS) throw new PositionHistoryBackfillProviderContractError();
    const candidates: PositionHistoryCandidate[] = [];
    let skippedInvalid = 0;
    for (const position of response.positions) {
      if (position.deviceId !== request.externalDeviceId) throw new PositionHistoryBackfillProviderContractError();
      const input = mapEquGpsPositionToHistoryInput(position, response.fetchedAt);
      if (input.observedAt !== null && (input.observedAt.getTime() < request.from.getTime() || input.observedAt.getTime() > request.to.getTime())) throw new PositionHistoryBackfillProviderContractError();
      const candidate = normalizePositionHistoryCandidate({ ...input, ingestionSource: PositionIngestionSource.HISTORICAL_BACKFILL });
      if (candidate === null) skippedInvalid += 1;
      else candidates.push(candidate);
    }
    return Object.freeze({
      fetchFrom: new Date(request.from.getTime()),
      fetchTo: new Date(request.to.getTime()),
      fetchedAt: new Date(response.fetchedAt.getTime()),
      providerRows: response.positions.length,
      candidates: Object.freeze(candidates),
      skippedInvalid,
      requests: response.requests,
      retries: response.retries,
      rateLimitResponses: response.rateLimitResponses,
    });
  }

  private async fetch(request: PositionHistoryHistoricalWindowRequest, options: PositionHistoryHistoricalWindowReadOptions): Promise<Readonly<{ positions: readonly EquGpsPosition[]; fetchedAt: Date; requests: number; retries: number; rateLimitResponses: number }>> {
    let requests = 0;
    let retries = 0;
    let rateLimitResponses = 0;
    for (let attempt = 1; attempt <= POSITION_HISTORY_HISTORICAL_WINDOW_MAX_ATTEMPTS; attempt += 1) {
      await options.beforeRequestStart?.();
      const fetchedAt = this.clock.now();
      if (!Number.isFinite(fetchedAt.getTime())) throw new PositionHistoryBackfillTargetError();
      requests += 1;
      try {
        const positions = await this.gateway.getHistoricalPositions({ deviceId: request.externalDeviceId, from: request.from.toISOString(), to: request.to.toISOString() });
        return Object.freeze({ positions, fetchedAt: new Date(fetchedAt.getTime()), requests, retries, rateLimitResponses });
      } catch (error) {
        if (error instanceof EquGpsRateLimitError) rateLimitResponses += 1;
        if (!transient(error) || attempt === POSITION_HISTORY_HISTORICAL_WINDOW_MAX_ATTEMPTS) {
          recordPositionHistoryHistoricalWindowFailureAccounting(error, { requests, retries, rateLimitResponses });
          recordPositionHistoryHistoricalWindowProviderFailure(error, classifyPositionHistoryHistoricalWindowProviderFailure(error, { retryable: false, maxRetryAfterMs: POSITION_HISTORY_HISTORICAL_WINDOW_MAX_RETRY_AFTER_MS }));
          throw error;
        }
        const retryAfter = error instanceof EquGpsRateLimitError ? error.retryAfterMs : null;
        const delay = retryAfter ?? 1_000 * 2 ** (attempt - 1);
        if (delay > POSITION_HISTORY_HISTORICAL_WINDOW_MAX_RETRY_AFTER_MS) {
          recordPositionHistoryHistoricalWindowFailureAccounting(error, { requests, retries, rateLimitResponses });
          recordPositionHistoryHistoricalWindowProviderFailure(error, classifyPositionHistoryHistoricalWindowProviderFailure(error, { retryable: false, maxRetryAfterMs: POSITION_HISTORY_HISTORICAL_WINDOW_MAX_RETRY_AFTER_MS }));
          throw error;
        }
        retries += 1;
        await this.sleeper.sleep(delay);
      }
    }
    throw new PositionHistoryBackfillProviderContractError();
  }
}
