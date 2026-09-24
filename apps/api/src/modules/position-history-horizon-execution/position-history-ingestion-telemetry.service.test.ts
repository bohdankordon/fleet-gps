import assert from "node:assert/strict";
import test from "node:test";
import { EquGpsHttpError, EquGpsNetworkError, EquGpsRateLimitError, EquGpsResponseValidationError, EquGpsTimeoutError } from "@taxi-gps/equgps";
import { PositionHistoryBackfillProviderContractError } from "../position-history-historical-window/position-history-historical-window.errors";
import { classifyIngestionTelemetryFailure, POSITION_HISTORY_INGESTION_TELEMETRY_MAX_STARTS, PositionHistoryIngestionTelemetryService } from "./position-history-ingestion-telemetry.service";

function fakeClock(startMs = Date.parse("2026-09-14T12:00:00Z")) {
  let now = startMs;
  return { clock: { now: (): Date => new Date(now) }, advance: (ms: number): void => { now += ms; }, set: (ms: number): void => { now = ms; }, nowMs: (): number => now };
}

test("runtime timestamps are safe and counters reset on new service instance", () => {
  const first = fakeClock();
  const telemetry = new PositionHistoryIngestionTelemetryService(first.clock);
  assert.equal(telemetry.isPollerStarted(), false);
  const empty = telemetry.snapshot(new Date(first.nowMs()));
  assert.equal(empty.requestStartsLastMinute, 0);
  assert.equal(empty.requestStartsSinceProcessStart, 0);
  assert.equal(empty.lastCycleStartedAt, null);
  assert.equal(empty.lastCycleCompletedAt, null);
  assert.deepEqual([empty.cyclesCompletedSinceProcessStart, empty.lastCycleDurationMs, empty.maxCycleDurationMsSinceProcessStart, empty.cyclesExceedingPollIntervalSinceProcessStart], [0, null, null, 0]);
  assert.ok(empty.processStartedAt instanceof Date);
  telemetry.markPollerStarted();
  assert.equal(telemetry.isPollerStarted(), true);
  telemetry.startCycle(new Date(first.nowMs()));
  assert.equal(telemetry.snapshot(new Date(first.nowMs())).cycleInFlight, true);
  first.advance(1000);
  telemetry.completeCycle(new Date(first.nowMs()));
  const done = telemetry.snapshot(new Date(first.nowMs()));
  assert.equal(done.cycleInFlight, false);
  assert.equal(done.lastCycleStartedAt?.toISOString(), "2026-09-14T12:00:00.000Z");
  assert.equal(done.lastCycleCompletedAt?.toISOString(), "2026-09-14T12:00:01.000Z");
  assert.deepEqual([done.cyclesCompletedSinceProcessStart, done.lastCycleDurationMs, done.maxCycleDurationMsSinceProcessStart, done.cyclesExceedingPollIntervalSinceProcessStart], [1, 1000, 1000, 0]);
  telemetry.startCycle(new Date(first.nowMs()));
  first.advance(30_000);
  telemetry.completeCycle(new Date(first.nowMs()));
  const slow = telemetry.snapshot(new Date(first.nowMs()));
  assert.deepEqual([slow.cyclesCompletedSinceProcessStart, slow.lastCycleDurationMs, slow.maxCycleDurationMsSinceProcessStart, slow.cyclesExceedingPollIntervalSinceProcessStart], [2, 30_000, 30_000, 1]);
  const second = new PositionHistoryIngestionTelemetryService(first.clock);
  assert.equal(second.snapshot(new Date(first.nowMs())).requestStartsSinceProcessStart, 0);
  assert.equal(second.snapshot(new Date(first.nowMs())).cyclesCompletedSinceProcessStart, 0);
  assert.equal(second.isPollerStarted(), false);
});

test("request rate counts starts inside 60s, prunes outside, retries count as starts", () => {
  const fake = fakeClock();
  const telemetry = new PositionHistoryIngestionTelemetryService(fake.clock);
  assert.equal(telemetry.getRequestStartsLastMinute(new Date(fake.nowMs())), 0);
  telemetry.recordRequestStart(new Date(fake.nowMs()));
  fake.advance(10_000);
  telemetry.recordRequestStart(new Date(fake.nowMs()));
  telemetry.recordRequestStart(new Date(fake.nowMs()));
  assert.equal(telemetry.getRequestStartsLastMinute(new Date(fake.nowMs())), 3);
  assert.equal(telemetry.snapshot(new Date(fake.nowMs())).requestStartsSinceProcessStart, 3);
  fake.advance(51_000);
  assert.equal(telemetry.getRequestStartsLastMinute(new Date(fake.nowMs())), 2);
  fake.advance(10_000);
  assert.equal(telemetry.getRequestStartsLastMinute(new Date(fake.nowMs())), 0);
  telemetry.recordProviderRetry(2);
  assert.equal(telemetry.snapshot(new Date(fake.nowMs())).retriesSinceProcessStart, 2);
});

test("bounded timestamp storage never grows without limit", () => {
  const fake = fakeClock();
  const telemetry = new PositionHistoryIngestionTelemetryService(fake.clock);
  for (let index = 0; index < POSITION_HISTORY_INGESTION_TELEMETRY_MAX_STARTS + 50; index += 1) {
    telemetry.recordRequestStart(new Date(fake.nowMs()));
    fake.advance(100);
  }
  const snapshot = telemetry.snapshot(new Date(fake.nowMs()));
  assert.equal(snapshot.requestStartsSinceProcessStart, POSITION_HISTORY_INGESTION_TELEMETRY_MAX_STARTS + 50);
  assert.ok(snapshot.requestStartsLastMinute <= POSITION_HISTORY_INGESTION_TELEMETRY_MAX_STARTS);
});
test("failure classification distinguishes safe categories with unknown fallback and no raw leakage", () => {
  assert.equal(classifyIngestionTelemetryFailure(new EquGpsRateLimitError("getHistoricalPositions", null)), "rate_limit");
  assert.equal(classifyIngestionTelemetryFailure(new EquGpsHttpError(503, "getHistoricalPositions")), "provider_5xx");
  assert.equal(classifyIngestionTelemetryFailure(new EquGpsNetworkError("getHistoricalPositions")), "network");
  assert.equal(classifyIngestionTelemetryFailure(new EquGpsTimeoutError("getHistoricalPositions")), "timeout");
  assert.equal(classifyIngestionTelemetryFailure(new EquGpsResponseValidationError("getHistoricalPositions", "unexpected_response_shape")), "contract");
  assert.equal(classifyIngestionTelemetryFailure(new PositionHistoryBackfillProviderContractError()), "contract");
  assert.equal(classifyIngestionTelemetryFailure(new EquGpsHttpError(400, "getHistoricalPositions")), "provider_blocked");
  const storageLike = Object.assign(new Error("persist"), { name: "PrismaClientKnownRequestError", code: "P2002" });
  assert.equal(classifyIngestionTelemetryFailure(storageLike), "storage");
  assert.equal(classifyIngestionTelemetryFailure(new Error("boom")), "unknown");
  assert.equal(classifyIngestionTelemetryFailure(null), "unknown");
  const fake = fakeClock();
  const telemetry = new PositionHistoryIngestionTelemetryService(fake.clock);
  telemetry.recordProviderFailure(new EquGpsRateLimitError("getHistoricalPositions", null));
  telemetry.recordProviderFailure(new EquGpsHttpError(503, "getHistoricalPositions"));
  telemetry.recordProviderFailure(new EquGpsTimeoutError("getHistoricalPositions"));
  telemetry.recordProviderFailure(new EquGpsNetworkError("getHistoricalPositions"));
  telemetry.recordProviderFailure(new EquGpsResponseValidationError("getHistoricalPositions", "unexpected_response_shape"));
  telemetry.recordProviderFailure(storageLike);
  telemetry.recordProviderFailure(new Error("mystery"));
  telemetry.recordProviderFailure(new EquGpsHttpError(403, "getHistoricalPositions"));
  const snapshot = telemetry.snapshot(new Date(fake.nowMs()));
  assert.equal(snapshot.rateLimitResponsesSinceProcessStart, 1);
  assert.equal(snapshot.provider5xxSinceProcessStart, 1);
  assert.equal(snapshot.timeoutsSinceProcessStart, 1);
  assert.equal(snapshot.networkFailuresSinceProcessStart, 1);
  assert.equal(snapshot.contractFailuresSinceProcessStart, 1);
  assert.equal(snapshot.storageFailuresSinceProcessStart, 1);
  assert.equal(snapshot.unknownFailuresSinceProcessStart, 1);
  assert.equal(snapshot.providerBlockedResponsesSinceProcessStart, 1);
  assert.equal(snapshot.lastSafeFailureCategory, "provider_blocked");
  assert.ok(snapshot.lastSafeFailureAt instanceof Date);
  const serialized = JSON.stringify(snapshot);
  assert.equal(serialized.includes("boom"), false);
  assert.equal(serialized.includes("secret"), false);
});

test("lock contention and provider-blocked gauge are truthful without identity exposure", () => {
  const fake = fakeClock();
  const telemetry = new PositionHistoryIngestionTelemetryService(fake.clock);
  assert.equal(telemetry.snapshot(new Date(fake.nowMs())).historyLockContentionSinceProcessStart, 0);
  telemetry.recordLockContention();
  telemetry.recordLockContention();
  assert.equal(telemetry.snapshot(new Date(fake.nowMs())).historyLockContentionSinceProcessStart, 2);
  assert.equal(telemetry.getProviderBlockedStreams(new Date(fake.nowMs())), 0);
  telemetry.setProviderBlocked("continuous:vehicle-a", fake.nowMs() + 6 * 60 * 60 * 1000);
  telemetry.setProviderBlocked("replay:run-b", fake.nowMs() + 6 * 60 * 60 * 1000);
  assert.equal(telemetry.getProviderBlockedStreams(new Date(fake.nowMs())), 2);
  assert.equal(telemetry.snapshot(new Date(fake.nowMs())).providerBlockedStreams, 2);
  const serialized = JSON.stringify(telemetry.snapshot(new Date(fake.nowMs())));
  assert.equal(serialized.includes("vehicle-a"), false);
  assert.equal(serialized.includes("run-b"), false);
  fake.advance(6 * 60 * 60 * 1000 + 1);
  assert.equal(telemetry.getProviderBlockedStreams(new Date(fake.nowMs())), 0);
});

test("recent-tail visibility is process-local evidence only", () => {
  const fake = fakeClock();
  const telemetry = new PositionHistoryIngestionTelemetryService(fake.clock);
  assert.equal(telemetry.snapshot(new Date(fake.nowMs())).recentTailSuccessesSinceProcessStart, 0);
  assert.equal(telemetry.snapshot(new Date(fake.nowMs())).lastRecentTailSuccessAt, null);
  telemetry.recordRecentTailSuccess(new Date(fake.nowMs()));
  telemetry.recordRecentTailFailure();
  const snapshot = telemetry.snapshot(new Date(fake.nowMs()));
  assert.equal(snapshot.recentTailSuccessesSinceProcessStart, 1);
  assert.equal(snapshot.recentTailFailuresSinceProcessStart, 1);
  assert.equal(snapshot.lastRecentTailSuccessAt?.toISOString(), "2026-09-14T12:00:00.000Z");
  const fresh = new PositionHistoryIngestionTelemetryService(fake.clock);
  assert.equal(fresh.snapshot(new Date(fake.nowMs())).recentTailSuccessesSinceProcessStart, 0);
});
test("retention execution telemetry starts unobserved and records success, skip, and failure truthfully", () => {
  const fake = fakeClock();
  const telemetry = new PositionHistoryIngestionTelemetryService(fake.clock);
  const initial = telemetry.snapshot(new Date(fake.nowMs()));
  assert.equal(initial.lastRetentionOutcome, "NOT_OBSERVED_THIS_PROCESS");
  assert.equal(initial.lastRetentionAttemptAt, null);
  assert.equal(initial.retentionRunning, false);
  telemetry.startRetentionAttempt(new Date(fake.nowMs()));
  assert.equal(telemetry.snapshot(new Date(fake.nowMs())).retentionRunning, true);
  fake.advance(1000);
  telemetry.completeRetentionAttempt("SUCCESS", null, new Date(fake.nowMs()));
  const success = telemetry.snapshot(new Date(fake.nowMs()));
  assert.equal(success.lastRetentionOutcome, "SUCCESS");
  assert.equal(success.retentionRunning, false);
  assert.equal(success.lastRetentionSkipCategory, null);
  telemetry.startRetentionAttempt(new Date(fake.nowMs()));
  telemetry.completeRetentionAttempt("SKIPPED", "ACTIVE_POPULATION", new Date(fake.nowMs()));
  const skipped = telemetry.snapshot(new Date(fake.nowMs()));
  assert.equal(skipped.lastRetentionOutcome, "SKIPPED");
  assert.equal(skipped.lastRetentionSkipCategory, "ACTIVE_POPULATION");
  telemetry.startRetentionAttempt(new Date(fake.nowMs()));
  telemetry.completeRetentionAttempt("FAILED", null, new Date(fake.nowMs()));
  const failed = telemetry.snapshot(new Date(fake.nowMs()));
  assert.equal(failed.lastRetentionOutcome, "FAILED");
  assert.equal(JSON.stringify(failed).includes("stack"), false);
  const fresh = new PositionHistoryIngestionTelemetryService(fake.clock);
  assert.equal(fresh.snapshot(new Date(fake.nowMs())).lastRetentionOutcome, "NOT_OBSERVED_THIS_PROCESS");
});
