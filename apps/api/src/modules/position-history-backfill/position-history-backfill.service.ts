import { Inject, Injectable } from "@nestjs/common";
import { PositionBackfillStatus } from "../../generated/prisma/client";
import { POSITION_HISTORY_HISTORICAL_WINDOW_MAX_ATTEMPTS, POSITION_HISTORY_HISTORICAL_WINDOW_MAX_RETRY_AFTER_MS, POSITION_HISTORY_HISTORICAL_WINDOW_MAX_ROWS, PositionHistoryHistoricalWindowService } from "../position-history-historical-window";
import { POSITION_HISTORY_HISTORICAL_WINDOW_SLEEPER } from "../position-history-historical-window/position-history-historical-window.tokens";
import type { PositionHistoryHistoricalWindowSleeper } from "../position-history-historical-window/position-history-historical-window.types";
import { POSITION_HISTORY_BACKFILL_MAX_TARGET_MS, POSITION_HISTORY_BACKFILL_WINDOW_MS } from "./position-history-backfill.constants";
import { PositionHistoryBackfillTargetError } from "./position-history-backfill.errors";
import { POSITION_HISTORY_BACKFILL_REPOSITORY } from "./position-history-backfill.tokens";
import type { PositionHistoryBackfillRepository, PositionHistoryBackfillResult, PositionHistoryBackfillRunOptions, PositionHistoryBackfillTarget } from "./position-history-backfill.types";

export { POSITION_HISTORY_BACKFILL_MAX_TARGET_MS } from "./position-history-backfill.constants";
export { POSITION_HISTORY_BACKFILL_WINDOW_MS } from "./position-history-backfill.constants";
export const POSITION_HISTORY_BACKFILL_MAX_ROWS_PER_WINDOW = POSITION_HISTORY_HISTORICAL_WINDOW_MAX_ROWS;
export const POSITION_HISTORY_BACKFILL_PACING_MS = 500;
export const POSITION_HISTORY_BACKFILL_MAX_ATTEMPTS = POSITION_HISTORY_HISTORICAL_WINDOW_MAX_ATTEMPTS;
export const POSITION_HISTORY_BACKFILL_MAX_RETRY_AFTER_MS = POSITION_HISTORY_HISTORICAL_WINDOW_MAX_RETRY_AFTER_MS;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validTarget(target: PositionHistoryBackfillTarget): boolean {
  const from = target.from.getTime();
  const to = target.to.getTime();
  return uuid.test(target.vehicleId) && Number.isFinite(from) && Number.isFinite(to) && from < to && to - from <= POSITION_HISTORY_BACKFILL_MAX_TARGET_MS;
}

@Injectable()
export class PositionHistoryBackfillService {
  public constructor(
    private readonly historicalWindow: PositionHistoryHistoricalWindowService,
    @Inject(POSITION_HISTORY_BACKFILL_REPOSITORY) private readonly repository: PositionHistoryBackfillRepository,
    @Inject(POSITION_HISTORY_HISTORICAL_WINDOW_SLEEPER) private readonly sleeper: PositionHistoryHistoricalWindowSleeper,
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
      const response = await this.historicalWindow.read({ externalDeviceId: checkpoint.externalDeviceId, from: cursor, to: windowTo });
      aggregate.requests += response.requests;
      aggregate.providerRows += response.providerRows;
      aggregate.historyCandidates += response.candidates.length;
      aggregate.historySkippedInvalid += response.skippedInvalid;
      aggregate.retries += response.retries;
      aggregate.rateLimitResponses += response.rateLimitResponses;
      const completed = windowTo.getTime() === checkpoint.rangeTo.getTime();
      const persisted = await this.repository.persistWindow({
        checkpointId: checkpoint.id,
        vehicleId: checkpoint.vehicleId,
        expectedNextFrom: cursor,
        nextFrom: windowTo,
        completed,
        candidates: response.candidates,
        ...(options.durableAccounting === undefined ? {} : { durableAccounting: options.durableAccounting }),
      });
      aggregate.historyInserted += persisted.inserted;
      aggregate.historyDuplicates += persisted.duplicates;
      aggregate.windowsCompleted += 1;
      cursor = windowTo;
      if (!completed && options.maxWindows !== undefined && aggregate.windowsCompleted >= options.maxWindows) return Object.freeze({ alreadyCompleted: false, resumed, ...aggregate, completed: false });
      if (!completed) await this.sleeper.sleep(POSITION_HISTORY_BACKFILL_PACING_MS);
    }
    return Object.freeze({ alreadyCompleted: false, resumed, ...aggregate, completed: true });
  }

}
