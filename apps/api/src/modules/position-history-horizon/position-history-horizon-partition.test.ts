import assert from "node:assert/strict";
import test from "node:test";
import { POSITION_HISTORY_BACKFILL_MAX_TARGET_MS } from "../position-history-backfill/position-history-backfill.constants";
import { partitionPositionHistoryHorizon } from "./position-history-horizon-partition";
import { POSITION_HISTORY_ABSOLUTE_DAY_MS } from "./position-history-horizon.policy";

function assertExactPartition(days: number, to: Date): void {
  const slices = partitionPositionHistoryHorizon(to, days);
  assert.equal(slices[0]?.from.getTime(), to.getTime() - days * POSITION_HISTORY_ABSOLUTE_DAY_MS);
  assert.equal(slices.at(-1)?.to.getTime(), to.getTime());
  assert.equal(slices.reduce((sum, slice) => sum + slice.durationMs, 0), days * POSITION_HISTORY_ABSOLUTE_DAY_MS);
  for (const [index, slice] of slices.entries()) {
    assert.equal(slice.index, index);
    assert.ok(slice.durationMs > 0 && slice.durationMs <= POSITION_HISTORY_BACKFILL_MAX_TARGET_MS);
    assert.equal(slice.to.getTime() - slice.from.getTime(), slice.durationMs);
    if (index > 0) assert.equal(slices[index - 1]?.to.getTime(), slice.from.getTime());
  }
}

test("90 absolute days partition backward from the anchor into one oldest 6-day remainder and twelve full targets", () => {
  const to = new Date("2026-08-11T02:00:00.000Z");
  const slices = partitionPositionHistoryHorizon(to, 90);
  assertExactPartition(90, to);
  assert.equal(slices.length, 13);
  assert.equal(slices[0]?.durationMs, 6 * POSITION_HISTORY_ABSOLUTE_DAY_MS);
  assert.equal(slices.filter((slice) => slice.durationMs === 7 * POSITION_HISTORY_ABSOLUTE_DAY_MS).length, 12);
});

test("365-day architectural policy uses the same algorithm with one oldest 1-day remainder and 52 full targets", () => {
  const to = new Date("2027-01-01T00:00:00.000Z");
  const slices = partitionPositionHistoryHorizon(to, 365);
  assertExactPartition(365, to);
  assert.equal(slices.length, 53);
  assert.equal(slices[0]?.durationMs, POSITION_HISTORY_ABSOLUTE_DAY_MS);
  assert.equal(slices.filter((slice) => slice.durationMs === 7 * POSITION_HISTORY_ABSOLUTE_DAY_MS).length, 52);
});

test("DST and local offset boundaries do not alter absolute durations or chronological boundaries", () => {
  const to = new Date("2026-10-26T02:00:00+01:00");
  assertExactPartition(90, to);
  const slices = partitionPositionHistoryHorizon(to, 90);
  assert.equal(slices.at(-1)?.to.toISOString(), "2026-10-26T01:00:00.000Z");
  assert.equal(slices.at(-1)?.durationMs, 7 * POSITION_HISTORY_ABSOLUTE_DAY_MS);
});
