import { Inject, Injectable } from "@nestjs/common";
import { EquGpsHttpError, EquGpsNetworkError, EquGpsRateLimitError, EquGpsTimeoutError, type EquGpsPosition } from "@taxi-gps/equgps";
import { PositionBackfillStatus, PositionIngestionSource } from "../../generated/prisma/client";
import { EquGpsGatewayService } from "../equgps/equgps-gateway.service";
import { mapEquGpsPositionToHistoryInput, normalizePositionHistoryCandidate, type PositionHistoryCandidate } from "../position-history";
import { POSITION_HISTORY_BACKFILL_MAX_TARGET_MS } from "./position-history-backfill.constants";
import { PositionHistoryBackfillProviderContractError, PositionHistoryBackfillTargetError } from "./position-history-backfill.errors";
import { classifyPositionHistoryBackfillProviderFailure, recordPositionHistoryBackfillProviderFailure } from "./position-history-backfill-failure-diagnostics";
import { POSITION_HISTORY_BACKFILL_CLOCK, POSITION_HISTORY_BACKFILL_REPOSITORY, POSITION_HISTORY_BACKFILL_SLEEPER } from "./position-history-backfill.tokens";
import type { PositionHistoryBackfillClock, PositionHistoryBackfillRepository, PositionHistoryBackfillResult, PositionHistoryBackfillRunOptions, PositionHistoryBackfillSleeper, PositionHistoryBackfillTarget } from "./position-history-backfill.types";

export const POSITION_HISTORY_BACKFILL_WINDOW_MS = 60 * 60 * 1_000;
export { POSITION_HISTORY_BACKFILL_MAX_TARGET_MS } from "./position-history-backfill.constants";
export const POSITION_HISTORY_BACKFILL_MAX_ROWS_PER_WINDOW = 10_000;
export const POSITION_HISTORY_BACKFILL_PACING_MS = 500;
export const POSITION_HISTORY_BACKFILL_MAX_ATTEMPTS = 3;
export const POSITION_HISTORY_BACKFILL_MAX_RETRY_AFTER_MS = 60_000;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validTarget(target: PositionHistoryBackfillTarget): boolean {
  const from = target.from.getTime();
  const to = target.to.getTime();
  return uuid.test(target.vehicleId) && Number.isFinite(from) && Number.isFinite(to) && from < to && to - from <= POSITION_HISTORY_BACKFILL_MAX_TARGET_MS;
}

function transient(error: unknown): boolean {
  return error instanceof EquGpsNetworkError
    || error instanceof EquGpsTimeoutError
    || error instanceof EquGpsRateLimitError
    || (error instanceof EquGpsHttpError && error.status !== undefined && error.status >= 500);
}

@Injectable()
export class PositionHistoryBackfillService {
  public constructor(
    private readonly gateway: EquGpsGatewayService,
    @Inject(POSITION_HISTORY_BACKFILL_REPOSITORY) private readonly repository: PositionHistoryBackfillRepository,
    @Inject(POSITION_HISTORY_BACKFILL_CLOCK) private readonly clock: PositionHistoryBackfillClock,
    @Inject(POSITION_HISTORY_BACKFILL_SLEEPER) private readonly sleeper: PositionHistoryBackfillSleeper,
  ) {}

  public async run(target: PositionHistoryBackfillTarget, options: PositionHistoryBackfillRunOptions = {}): Promise<PositionHistoryBackfillResult> {
    if (!validTarget(target)
      || (options.maxWindows !== undefined && (!Number.isInteger(options.maxWindows) || options.maxWindows < 1 || options.maxWindows > 168))
      || (options.paceBeforeFirstWindow !== undefined && typeof options.paceBeforeFirstWindow !== "boolean")) throw new PositionHistoryBackfillTargetError();
    const checkpoint = await this.repository.prepare(target);
    const alreadyCompleted = checkpoint.status === PositionBackfillStatus.COMPLETED;
    const resumed = checkpoint.nextFrom.getTime() > checkpoint.rangeFrom.getTime();
    const aggregate = { requests: 0, providerRows: 0, historyCandidates: 0, historyInserted: 0, historyDuplicates: 0, historySkippedInvalid: 0, windowsCompleted: 0, retries: 0, rateLimitResponses: 0 };
    if (alreadyCompleted) return Object.freeze({ alreadyCompleted: true, resumed: true, ...aggregate, completed: true });

    let cursor = new Date(checkpoint.nextFrom.getTime());
    if (options.paceBeforeFirstWindow === true && cursor.getTime() < checkpoint.rangeTo.getTime()) await this.sleeper.sleep(POSITION_HISTORY_BACKFILL_PACING_MS);
    while (cursor.getTime() < checkpoint.rangeTo.getTime()) {
      const windowTo = new Date(Math.min(cursor.getTime() + POSITION_HISTORY_BACKFILL_WINDOW_MS, checkpoint.rangeTo.getTime()));
      const response = await this.fetchWindow(checkpoint.externalDeviceId, cursor, windowTo, aggregate);
      const { positions, fetchedAt } = response;
      if (positions.length > POSITION_HISTORY_BACKFILL_MAX_ROWS_PER_WINDOW) throw new PositionHistoryBackfillProviderContractError();
      aggregate.providerRows += positions.length;
      const candidates: PositionHistoryCandidate[] = [];
      for (const position of positions) {
        if (position.deviceId !== checkpoint.externalDeviceId) throw new PositionHistoryBackfillProviderContractError();
        const input = mapEquGpsPositionToHistoryInput(position, fetchedAt);
        if (input.observedAt !== null && (input.observedAt.getTime() < cursor.getTime() || input.observedAt.getTime() > windowTo.getTime())) throw new PositionHistoryBackfillProviderContractError();
        const candidate = normalizePositionHistoryCandidate({ ...input, ingestionSource: PositionIngestionSource.HISTORICAL_BACKFILL });
        if (candidate === null) aggregate.historySkippedInvalid += 1;
        else candidates.push(candidate);
      }
      aggregate.historyCandidates += candidates.length;
      const completed = windowTo.getTime() === checkpoint.rangeTo.getTime();
      const persisted = await this.repository.persistWindow({ checkpointId: checkpoint.id, vehicleId: checkpoint.vehicleId, expectedNextFrom: cursor, nextFrom: windowTo, completed, candidates });
      aggregate.historyInserted += persisted.inserted;
      aggregate.historyDuplicates += persisted.duplicates;
      aggregate.windowsCompleted += 1;
      cursor = windowTo;
      if (!completed && options.maxWindows !== undefined && aggregate.windowsCompleted >= options.maxWindows) return Object.freeze({ alreadyCompleted: false, resumed, ...aggregate, completed: false });
      if (!completed) await this.sleeper.sleep(POSITION_HISTORY_BACKFILL_PACING_MS);
    }
    return Object.freeze({ alreadyCompleted: false, resumed, ...aggregate, completed: true });
  }

  private async fetchWindow(externalDeviceId: number, from: Date, to: Date, aggregate: { requests: number; retries: number; rateLimitResponses: number }): Promise<Readonly<{ positions: readonly EquGpsPosition[]; fetchedAt: Date }>> {
    for (let attempt = 1; attempt <= POSITION_HISTORY_BACKFILL_MAX_ATTEMPTS; attempt += 1) {
      const fetchedAt = this.clock.now();
      if (!Number.isFinite(fetchedAt.getTime())) throw new PositionHistoryBackfillTargetError();
      aggregate.requests += 1;
      try {
        const positions = await this.gateway.getHistoricalPositions({ deviceId: externalDeviceId, from: from.toISOString(), to: to.toISOString() });
        return Object.freeze({ positions, fetchedAt: new Date(fetchedAt.getTime()) });
      } catch (error) {
        if (error instanceof EquGpsRateLimitError) aggregate.rateLimitResponses += 1;
        if (!transient(error) || attempt === POSITION_HISTORY_BACKFILL_MAX_ATTEMPTS) {
          recordPositionHistoryBackfillProviderFailure(error, classifyPositionHistoryBackfillProviderFailure(error, { retryable: false, maxRetryAfterMs: POSITION_HISTORY_BACKFILL_MAX_RETRY_AFTER_MS }));
          throw error;
        }
        const retryAfter = error instanceof EquGpsRateLimitError ? error.retryAfterMs : null;
        const delay = retryAfter ?? 1_000 * 2 ** (attempt - 1);
        if (delay > POSITION_HISTORY_BACKFILL_MAX_RETRY_AFTER_MS) {
          recordPositionHistoryBackfillProviderFailure(error, classifyPositionHistoryBackfillProviderFailure(error, { retryable: false, maxRetryAfterMs: POSITION_HISTORY_BACKFILL_MAX_RETRY_AFTER_MS }));
          throw error;
        }
        aggregate.retries += 1;
        await this.sleeper.sleep(delay);
      }
    }
    throw new PositionHistoryBackfillProviderContractError();
  }
}
