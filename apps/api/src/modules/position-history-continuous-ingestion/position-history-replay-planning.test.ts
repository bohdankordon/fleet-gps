import assert from "node:assert/strict";
import test from "node:test";
import { PositionHistoryReplayKind } from "../../generated/prisma/client";
import { POSITION_HISTORY_ABSOLUTE_DAY_MS } from "../position-history-horizon/position-history-horizon.policy";
import { canonicalDailyPositionHistoryReplayAnchor, clampPositionHistoryReplayTimeoutTier, nextPositionHistoryReplayTimeoutTier, positionHistoryReplayAdaptiveWindowEnds, positionHistoryReplayCheckpoints, positionHistoryReplayTarget, positionHistoryReplayTimeoutRecoveryKey, positionHistoryReplayTimeoutWindowEnds, positionHistoryReplayTimeoutWindowMs } from "./position-history-replay-planning";

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

test("timeout recovery windows step 6h to 3h to 1h to 30m to 15m with a hard floor", () => {
  assert.deepEqual([0, 1, 2, 3, 4].map(positionHistoryReplayTimeoutWindowMs), [6 * 3_600_000, 3 * 3_600_000, 3_600_000, 30 * 60_000, 15 * 60_000]);
  assert.equal(clampPositionHistoryReplayTimeoutTier(-3), 0);
  assert.equal(clampPositionHistoryReplayTimeoutTier(99), 4);
  assert.equal(clampPositionHistoryReplayTimeoutTier(Number.NaN), 0);
  assert.equal(nextPositionHistoryReplayTimeoutTier(2), 3);
  assert.equal(nextPositionHistoryReplayTimeoutTier(4), 4, "the fifteen-minute floor never shrinks further");
});

test("timeout quanta honor the learned maximum while oversized fallback never goes sub-hour", () => {
  const from = new Date("2026-09-01T00:00:00Z");
  const to = new Date("2026-09-02T00:00:00Z");
  const ends = (tier: number) => positionHistoryReplayTimeoutWindowEnds(from, to, tier).map((value) => value.toISOString());
  assert.deepEqual(ends(0), ["2026-09-01T06:00:00.000Z", "2026-09-01T03:00:00.000Z", "2026-09-01T01:00:00.000Z"]);
  assert.deepEqual(ends(1), ["2026-09-01T03:00:00.000Z", "2026-09-01T01:00:00.000Z"]);
  assert.deepEqual(ends(2), ["2026-09-01T01:00:00.000Z"]);
  assert.deepEqual(ends(3), ["2026-09-01T00:30:00.000Z"]);
  assert.deepEqual(ends(4), ["2026-09-01T00:15:00.000Z"]);
  assert.deepEqual(
    positionHistoryReplayTimeoutWindowEnds(from, new Date("2026-09-01T00:10:00.000Z"), 4).map((value) => value.toISOString()),
    ["2026-09-01T00:10:00.000Z"],
  );
});

test("recovery keys identify equivalent logical positions across generations", () => {
  const logical = { vehicleId: "vehicle-a", rangeFrom: new Date("2026-09-01T02:00:00Z"), rangeTo: new Date("2026-09-08T02:00:00Z"), nextFrom: new Date("2026-09-01T02:00:00Z") };
  assert.equal(positionHistoryReplayTimeoutRecoveryKey(logical), positionHistoryReplayTimeoutRecoveryKey({ ...logical }));
  assert.notEqual(positionHistoryReplayTimeoutRecoveryKey(logical), positionHistoryReplayTimeoutRecoveryKey({ ...logical, vehicleId: "vehicle-b" }));
  assert.notEqual(positionHistoryReplayTimeoutRecoveryKey(logical), positionHistoryReplayTimeoutRecoveryKey({ ...logical, rangeTo: new Date("2026-09-09T02:00:00Z") }));
  assert.notEqual(positionHistoryReplayTimeoutRecoveryKey(logical), positionHistoryReplayTimeoutRecoveryKey({ ...logical, nextFrom: new Date("2026-09-01T02:30:00.000Z") }));
  assert.throws(() => positionHistoryReplayTimeoutRecoveryKey({ ...logical, vehicleId: "" }));
  assert.throws(() => positionHistoryReplayTimeoutRecoveryKey({ ...logical, nextFrom: logical.rangeTo }));
});
