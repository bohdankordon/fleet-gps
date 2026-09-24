import assert from "node:assert/strict";
import test from "node:test";
import { parsePositionHistoryIngestionStatus, PositionHistoryIngestionStatusContractError } from "./position-history-ingestion-status-contract";
import { positionHistoryIngestionStatusFixture, positionHistoryIngestionStatusStateFixture } from "./position-history-ingestion-status-fixture";

test("accepts the supported aggregate ingestion status without sensitive fields", () => {
  const parsed = parsePositionHistoryIngestionStatus(positionHistoryIngestionStatusFixture());
  assert.equal(parsed.replay.daily.hasReplayDebt, false);
  assert.equal(parsed.retention.lastOutcome, "NOT_OBSERVED_THIS_PROCESS");
  const serialized = JSON.stringify(parsed);
  for (const forbidden of ["fixFingerprint", "latitude", "externalDeviceId", "leaseOwner", "stack"]) assert.equal(serialized.includes(forbidden), false);
});

test("rejects debt, cursor, retention, and scope inconsistencies", () => {
  const base = positionHistoryIngestionStatusFixture();
  const debt = { ...base.replay.daily, hasReplayDebt: false, overdueIncompleteGenerations: 1, incompleteGenerations: 1 };
  assert.throws(() => parsePositionHistoryIngestionStatus({ ...base, replay: { ...base.replay, daily: debt } }), PositionHistoryIngestionStatusContractError);
  const cursor = { ...base.cursor, missingCursorCount: 0 };
  assert.throws(() => parsePositionHistoryIngestionStatus({ ...base, cursor: { ...cursor, mappedVehicles: 2, cursorCount: 1 } }), PositionHistoryIngestionStatusContractError);
  const retention = { ...base.retention, lastOutcome: "SUCCESS" as const, lastAttemptAt: null };
  assert.throws(() => parsePositionHistoryIngestionStatus({ ...base, retention }), PositionHistoryIngestionStatusContractError);
  const skip = { ...base.retention, lastOutcome: "SUCCESS" as const, lastAttemptAt: base.retention.currentRetentionPolicyFloor, lastSkipCategory: "LOCK_UNAVAILABLE" as const };
  assert.throws(() => parsePositionHistoryIngestionStatus({ ...base, retention: skip }), PositionHistoryIngestionStatusContractError);
  assert.throws(() => parsePositionHistoryIngestionStatus({ ...base, extra: 1 }), PositionHistoryIngestionStatusContractError);
});

test("accepts distinct latest and oldest incomplete debt while rejecting fabricated progress", () => {
  const debt = positionHistoryIngestionStatusStateFixture("DEBT");
  const rolling = parsePositionHistoryIngestionStatus(debt).replay.rolling;
  assert.deepEqual([rolling.checkpointsTotal, rolling.oldestIncompleteCheckpointsTotal, rolling.estimatedRemainingWindows, rolling.newerIncompleteGenerations], [0, 741, 10_488, 1]);
  assert.deepEqual([rolling.rangeFrom, rolling.rangeTo], ["2026-06-24T02:00:00.000Z", "2026-09-22T02:00:00.000Z"]);
  assert.deepEqual([rolling.oldestIncompleteRangeFrom, rolling.oldestIncompleteRangeTo], ["2026-06-17T02:00:00.000Z", "2026-09-15T02:00:00.000Z"]);
  const invalid = (override: Record<string, unknown>) => assert.throws(() => parsePositionHistoryIngestionStatus({ ...debt, replay: { ...debt.replay, rolling: { ...rolling, ...override } } }), PositionHistoryIngestionStatusContractError);
  invalid({ oldestIncompleteCheckpointsCompleted: 741 });
  invalid({ oldestIncompleteProgressPercent: 50 });
  invalid({ newerIncompleteGenerations: 0 });
  invalid({ oldestIncompleteRangeFrom: null });
  invalid({ oldestIncompleteRangeTo: null });
  invalid({ oldestIncompleteRangeFrom: rolling.oldestIncompleteRangeTo });
  invalid({ activeState: "RUNNING" });
  invalid({ queuedIncompleteGenerations: 1 });
  assert.throws(() => parsePositionHistoryIngestionStatus({ ...debt, providerTraffic: { ...debt.providerTraffic, lastFailureCategory: "raw provider error" } }), PositionHistoryIngestionStatusContractError);
});

test("null oldest incomplete anchor requires every oldest detail to be empty", () => {
  const empty = positionHistoryIngestionStatusFixture();
  const rolling = empty.replay.rolling;
  for (const detail of [
    { oldestIncompleteState: "PENDING" },
    { oldestIncompleteRangeFrom: "2026-06-17T02:00:00.000Z" },
    { oldestIncompleteRangeTo: "2026-09-15T02:00:00.000Z" },
    { oldestIncompleteCheckpointsTotal: 1 },
    { oldestIncompleteCheckpointsCompleted: 1, oldestIncompleteCheckpointsTotal: 1 },
    { oldestIncompleteCheckpointsRemaining: 1, oldestIncompleteCheckpointsTotal: 1 },
    { oldestIncompleteProgressPercent: 0 },
    { oldestIncompleteIsOverdue: true },
    { estimatedRemainingWindows: 1 },
    { incompleteGenerations: 1, newerIncompleteGenerations: 1 },
  ]) assert.throws(() => parsePositionHistoryIngestionStatus({ ...empty, replay: { ...empty.replay, rolling: { ...rolling, ...detail } } }), PositionHistoryIngestionStatusContractError);
});
