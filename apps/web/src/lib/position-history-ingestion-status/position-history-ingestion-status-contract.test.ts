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

test("accepts queued latest generation beside active debt and rejects fabricated active progress", () => {
  const debt = positionHistoryIngestionStatusStateFixture("DEBT");
  const rolling = parsePositionHistoryIngestionStatus(debt).replay.rolling;
  assert.deepEqual([rolling.checkpointsTotal, rolling.activeCheckpointsTotal, rolling.estimatedRemainingWindows, rolling.queuedIncompleteGenerations], [0, 741, 10_488, 1]);
  assert.throws(() => parsePositionHistoryIngestionStatus({ ...debt, replay: { ...debt.replay, rolling: { ...rolling, activeCheckpointsCompleted: 741 } } }), PositionHistoryIngestionStatusContractError);
  assert.throws(() => parsePositionHistoryIngestionStatus({ ...debt, providerTraffic: { ...debt.providerTraffic, lastFailureCategory: "raw provider error" } }), PositionHistoryIngestionStatusContractError);
});
