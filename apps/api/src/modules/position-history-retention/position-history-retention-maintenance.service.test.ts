import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { ApiConfig } from "../../config/api-config";
import { POSITION_HISTORY_MAINTENANCE_CRON } from "../position-history-population-runs/position-history-maintenance.service";
import { POSITION_HISTORY_POPULATION_RUN_POLL_INTERVAL_MS } from "../position-history-population-runs/position-history-population-run-poller.service";
import { PositionHistoryRetentionMaintenanceService, POSITION_HISTORY_RETENTION_CRON, POSITION_HISTORY_RETENTION_TIME_ZONE } from "./position-history-retention-maintenance.service";
import type { PositionHistoryRetentionService } from "./position-history-retention.service";
import { PositionHistoryRetentionExecutionError, type PositionHistoryRetentionExecutionResult, type PositionHistoryRetentionPlan } from "./position-history-retention.types";

const anchor = "2026-08-11T02:00:00.000Z";
const cutoff = "2026-05-13T02:00:00.000Z";

function plan(fullyObsolete = 1, candidates = 2, cursorFloors = 0, replayCheckpoints = 0): PositionHistoryRetentionPlan {
  return {
    policyDays: 90,
    canonicalAnchor: anchor,
    policyCutoff: cutoff,
    policyReconciliation: { cursorFloorCandidates: cursorFloors, replayCheckpointCandidates: replayCheckpoints },
    observations: { total: candidates, olderThanPolicyCutoff: candidates, atOrAfterPolicyCutoff: 0, oldestObservedAt: null, newestObservedAt: null, vehiclesWithObservationsOlderThanCutoff: candidates > 0 ? 1 : 0, executableObservationCandidates: candidates },
    checkpoints: { total: fullyObsolete, fullyObsolete, boundaryOverlap: 0, protected: 0, fullyObsoleteByStatus: { pending: 0, running: 0, completed: fullyObsolete }, boundaryOverlapByStatus: { pending: 0, running: 0, completed: 0 }, protectedByStatus: { pending: 0, running: 0, completed: 0 }, endingExactlyAtCutoff: 0, startingExactlyAtCutoff: 0, strictlyCrossingCutoff: 0 },
    safety: { hasBoundaryOverlap: false, boundaryOverlapCheckpointCount: 0, policyEligibleObservationCount: candidates, destructiveExecutionApproved: false },
  };
}

function execution(overrides: Partial<PositionHistoryRetentionExecutionResult> = {}): PositionHistoryRetentionExecutionResult {
  return { canonicalAnchor: anchor, policyCutoff: cutoff, advancedCursorFloors: 0, advancedReplayCheckpoints: 0, completedReplayCheckpoints: 0, deletedCheckpoints: 1, deletedObservations: 2, remainingFullyObsoleteCheckpoints: 0, remainingExecutableObservationCandidates: 0, stoppedByBudget: false, noWork: false, ...overrides };
}

function fixture(options: Readonly<{ enabled?: boolean; precheck?: PositionHistoryRetentionPlan; result?: PositionHistoryRetentionExecutionResult; failure?: Error }> = {}) {
  let prechecks = 0;
  let executions = 0;
  const retention = {
    getRetentionPlan: async () => { prechecks += 1; return options.precheck ?? plan(); },
    executeAutomaticRetention: async () => { executions += 1; if (options.failure) throw options.failure; return options.result ?? execution(); },
  } as PositionHistoryRetentionService;
  const config = { positionHistoryRetention: { enabled: options.enabled ?? true } } as ApiConfig;
  return { service: new PositionHistoryRetentionMaintenanceService(config, retention), prechecks: () => prechecks, executions: () => executions };
}

test("disabled automatic retention is a strict no-op before planner, lock, or destructive core", async () => {
  const item = fixture({ enabled: false });
  assert.deepEqual(await item.service.evaluate(), { outcome: "DISABLED", result: null });
  assert.equal(item.prechecks(), 0);
  assert.equal(item.executions(), 0);
});

test("automatic flag cannot disable or alter the independently callable manual Stage 19B service", () => {
  const automaticSource = readFileSync("src/modules/position-history-retention/position-history-retention-maintenance.service.ts", "utf8");
  const retentionSource = readFileSync("src/modules/position-history-retention/position-history-retention.service.ts", "utf8");
  assert.match(automaticSource, /positionHistoryRetention/);
  assert.doesNotMatch(automaticSource, /positionHistoryMaintenance/);
  assert.doesNotMatch(retentionSource, /POSITION_HISTORY_RETENTION_ENABLED|positionHistoryRetention|positionHistoryMaintenance/);
  assert.match(retentionSource, /public async executeRetention\(/);
});

test("read-only precheck avoids the mutation lock when there is clearly no work", async () => {
  const item = fixture({ precheck: plan(0, 0) });
  assert.deepEqual(await item.service.evaluate(), { outcome: "NO_WORK", result: null });
  assert.equal(item.prechecks(), 1);
  assert.equal(item.executions(), 0);
});

test("policy-floor candidates trigger locked reconciliation even without deletion candidates", async () => {
  const result = execution({ advancedCursorFloors: 1, advancedReplayCheckpoints: 2, completedReplayCheckpoints: 1, deletedCheckpoints: 0, deletedObservations: 0 });
  const item = fixture({ precheck: plan(0, 0, 1, 2), result });
  assert.deepEqual(await item.service.evaluate(), { outcome: "EXECUTED", result });
  assert.equal(item.executions(), 1);
});

test("one scheduled evaluation invokes the shared bounded core at most once even when budget stops it", async () => {
  const result = execution({ deletedCheckpoints: 5_000, deletedObservations: 0, remainingFullyObsoleteCheckpoints: 1, remainingExecutableObservationCandidates: 10, stoppedByBudget: true });
  const item = fixture({ result });
  assert.deepEqual(await item.service.evaluate(), { outcome: "EXECUTED", result });
  assert.equal(item.prechecks(), 1);
  assert.equal(item.executions(), 1);
});

test("fresh locked no-work truth overrides a stale work-positive precheck", async () => {
  const result = execution({ deletedCheckpoints: 0, deletedObservations: 0, noWork: true });
  const item = fixture({ precheck: plan(9, 9), result });
  assert.deepEqual(await item.service.evaluate(), { outcome: "NO_WORK", result });
  assert.equal(item.executions(), 1);
});

test("lock contention and active population are benign one-shot skips", async () => {
  for (const [code, outcome] of [["LOCK_UNAVAILABLE", "LOCK_UNAVAILABLE"], ["ACTIVE_DURABLE_RUN", "ACTIVE_POPULATION"]] as const) {
    const item = fixture({ failure: new PositionHistoryRetentionExecutionError(code) });
    assert.deepEqual(await item.service.evaluate(), { outcome, result: null });
    assert.equal(item.executions(), 1);
  }
});

test("scheduled callback contains unexpected failure with no retry", async () => {
  const item = fixture({ failure: new Error("sensitive-looking fixture failure") });
  assert.deepEqual(await item.service.scheduledEvaluate(), { outcome: "FAILED_SAFE", result: null });
  assert.equal(item.executions(), 1);
});

test("schedule is one daily 06:00 UTC cron with no startup catch-up or alternate trigger", () => {
  assert.equal(POSITION_HISTORY_RETENTION_CRON, "0 0 6 * * *");
  assert.equal(POSITION_HISTORY_RETENTION_TIME_ZONE, "UTC");
  assert.equal(POSITION_HISTORY_MAINTENANCE_CRON, "0 0 3 * * *");
  assert.equal(POSITION_HISTORY_POPULATION_RUN_POLL_INTERVAL_MS, 30_000);
  const source = readFileSync("src/modules/position-history-retention/position-history-retention-maintenance.service.ts", "utf8");
  assert.match(source, /@Cron\(POSITION_HISTORY_RETENTION_CRON,[^\n]*timeZone: POSITION_HISTORY_RETENTION_TIME_ZONE/);
  assert.equal((source.match(/@Cron\(/g) ?? []).length, 1);
  assert.equal((source.match(/executeAutomaticRetention\(/g) ?? []).length, 1);
  assert.doesNotMatch(source, /onModuleInit|onApplicationBootstrap|setTimeout|setInterval|fetch\(|EquGps/i);
});

test("automatic orchestrator has no provider, browser confirmation, public transport, or duplicate SQL concern", () => {
  const source = readFileSync("src/modules/position-history-retention/position-history-retention-maintenance.service.ts", "utf8");
  assert.doesNotMatch(source, /expectedCanonicalAnchor|expectedPolicyCutoff|Controller|@Post|DELETE FROM|deleteFullyObsolete|deleteExecutable|vehicleId|latitude|longitude/i);
});
