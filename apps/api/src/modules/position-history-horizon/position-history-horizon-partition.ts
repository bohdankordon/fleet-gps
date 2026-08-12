import { POSITION_HISTORY_BACKFILL_MAX_TARGET_MS } from "../position-history-backfill/position-history-backfill.constants";
import { POSITION_HISTORY_ABSOLUTE_DAY_MS } from "./position-history-horizon.policy";
import type { PositionHistoryHorizonSlice } from "./position-history-horizon.types";

export function partitionPositionHistoryHorizon(to: Date, horizonDays: number): readonly PositionHistoryHorizonSlice[] {
  const toMs = to.getTime();
  const durationMs = horizonDays * POSITION_HISTORY_ABSOLUTE_DAY_MS;
  if (!Number.isFinite(toMs) || !Number.isSafeInteger(horizonDays) || horizonDays < 1 || !Number.isSafeInteger(durationMs)) throw new Error("Invalid position history horizon policy");
  const horizonFromMs = toMs - durationMs;
  if (!Number.isSafeInteger(horizonFromMs)) throw new Error("Invalid position history horizon boundary");

  const newestFirst: Array<Readonly<{ from: Date; to: Date; durationMs: number }>> = [];
  let sliceToMs = toMs;
  while (sliceToMs > horizonFromMs) {
    const sliceFromMs = Math.max(horizonFromMs, sliceToMs - POSITION_HISTORY_BACKFILL_MAX_TARGET_MS);
    newestFirst.push(Object.freeze({ from: new Date(sliceFromMs), to: new Date(sliceToMs), durationMs: sliceToMs - sliceFromMs }));
    sliceToMs = sliceFromMs;
  }

  return Object.freeze(newestFirst.reverse().map((slice, index) => Object.freeze({ index, ...slice })));
}
