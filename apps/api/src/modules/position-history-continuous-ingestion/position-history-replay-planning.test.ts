import assert from "node:assert/strict";
import test from "node:test";
import { PositionHistoryReplayKind } from "../../generated/prisma/client";
import { POSITION_HISTORY_ABSOLUTE_DAY_MS } from "../position-history-horizon/position-history-horizon.policy";
import { canonicalDailyPositionHistoryReplayAnchor, positionHistoryReplayAdaptiveWindowEnds, positionHistoryReplayCheckpoints, positionHistoryReplayTarget } from "./position-history-replay-planning";

const vehicle = (vehicleId: string) => ({ vehicleId, externalDeviceId: 1, disabled: false });

test("daily anchor is the latest 02:00 UTC boundary not after safeNow", () => {
  assert.equal(canonicalDailyPositionHistoryReplayAnchor(new Date("2026-09-14T01:59:59.999Z")).toISOString(), "2026-09-13T02:00:00.000Z");
  assert.equal(canonicalDailyPositionHistoryReplayAnchor(new Date("2026-09-14T02:00:00.000Z")).toISOString(), "2026-09-14T02:00:00.000Z");
});

test("daily generation is exactly seven absolute days with one checkpoint per member", () => {
  const target = positionHistoryReplayTarget(PositionHistoryReplayKind.DAILY_7_DAY, new Date("2026-09-14T03:00:00Z"));
  assert.equal(target.rangeTo.getTime(), target.generationAnchor.getTime());
  assert.equal(target.rangeTo.getTime() - target.rangeFrom.getTime(), 7 * POSITION_HISTORY_ABSOLUTE_DAY_MS);
  const checkpoints = positionHistoryReplayCheckpoints(target, [vehicle("123e4567-e89b-42d3-a456-426614174001"), vehicle("123e4567-e89b-42d3-a456-426614174002")]);
  assert.equal(checkpoints.length, 2);
  assert.ok(checkpoints.every((checkpoint) => checkpoint.rangeFrom.getTime() === target.rangeFrom.getTime() && checkpoint.rangeTo.getTime() === target.rangeTo.getTime()));
});

test("rolling generation reuses Tuesday 02:00 UTC and partitions 90 days as 6 + twelve 7-day checkpoints per member", () => {
  const target = positionHistoryReplayTarget(PositionHistoryReplayKind.ROLLING_90_DAY, new Date("2026-09-14T03:00:00Z"));
  assert.equal(target.generationAnchor.toISOString(), "2026-09-08T02:00:00.000Z");
  assert.equal(target.rangeTo.getTime() - target.rangeFrom.getTime(), 90 * POSITION_HISTORY_ABSOLUTE_DAY_MS);
  const checkpoints = positionHistoryReplayCheckpoints(target, [vehicle("123e4567-e89b-42d3-a456-426614174001")]);
  assert.equal(checkpoints.length, 13);
  assert.equal(checkpoints[0]!.rangeTo.getTime() - checkpoints[0]!.rangeFrom.getTime(), 6 * POSITION_HISTORY_ABSOLUTE_DAY_MS);
  assert.ok(checkpoints.slice(1).every((checkpoint) => checkpoint.rangeTo.getTime() - checkpoint.rangeFrom.getTime() === 7 * POSITION_HISTORY_ABSOLUTE_DAY_MS));
  assert.equal(checkpoints[0]!.rangeFrom.getTime(), target.rangeFrom.getTime());
  assert.equal(checkpoints.at(-1)!.rangeTo.getTime(), target.rangeTo.getTime());
});

test("replay offers deterministic 6h, 3h, and 1h adaptive endpoints from the same durable start", () => {
  const from = new Date("2026-09-01T00:00:00Z");
  assert.deepEqual(positionHistoryReplayAdaptiveWindowEnds(from, new Date("2026-09-02T00:00:00Z")).map((value) => value.toISOString()), [
    "2026-09-01T06:00:00.000Z",
    "2026-09-01T03:00:00.000Z",
    "2026-09-01T01:00:00.000Z",
  ]);
  assert.deepEqual(positionHistoryReplayAdaptiveWindowEnds(from, new Date("2026-09-01T02:00:00Z")).map((value) => value.toISOString()), [
    "2026-09-01T02:00:00.000Z",
    "2026-09-01T01:00:00.000Z",
  ]);
});
