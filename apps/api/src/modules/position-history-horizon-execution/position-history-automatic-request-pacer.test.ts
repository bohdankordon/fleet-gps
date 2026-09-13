import assert from "node:assert/strict";
import test from "node:test";
import { POSITION_HISTORY_CONTINUOUS_REQUESTS_PER_MINUTE } from "../position-history-continuous-ingestion/position-history-continuous-ingestion.constants";
import { PositionHistoryAutomaticRequestPacer, POSITION_HISTORY_AUTOMATIC_REQUEST_START_GAP_MS } from "./position-history-automatic-request-pacer";

test("one automatic quantum spaces retries and cools the shared lock through the next legal start", async () => {
  let now = 0;
  const sleeps: number[] = [];
  const clock = { now: () => new Date(now) };
  const sleeper = { sleep: async (durationMs: number) => { sleeps.push(durationMs); now += durationMs; } };
  const first = new PositionHistoryAutomaticRequestPacer(clock, sleeper, POSITION_HISTORY_AUTOMATIC_REQUEST_START_GAP_MS);
  await first.beforeRequestStart();
  await first.beforeRequestStart();
  await first.coolBeforeLockRelease();
  assert.deepEqual(sleeps, [2_000, 2_000]);
  assert.equal(now, 4_000);

  const nextReplica = new PositionHistoryAutomaticRequestPacer(clock, sleeper, POSITION_HISTORY_AUTOMATIC_REQUEST_START_GAP_MS);
  await nextReplica.beforeRequestStart();
  assert.equal(now, 4_000);
  assert.equal(first.requestStarts(), 2);
});

test("the shared two-second start fence is the authoritative 30 requests/minute ceiling", () => {
  assert.equal(60_000 / POSITION_HISTORY_AUTOMATIC_REQUEST_START_GAP_MS, POSITION_HISTORY_CONTINUOUS_REQUESTS_PER_MINUTE);
});
