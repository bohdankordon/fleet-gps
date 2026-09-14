import assert from "node:assert/strict";
import test from "node:test";
import type { ApiConfig } from "../../config/api-config";
import { PositionHistoryIngestionTelemetryService } from "../position-history-horizon-execution/position-history-ingestion-telemetry.service";
import { nextAutomaticPositionHistoryRetentionExecutionAt, PositionHistoryRetentionMaintenanceService } from "./position-history-retention-maintenance.service";
import type { PositionHistoryRetentionService } from "./position-history-retention.service";
import { PositionHistoryRetentionExecutionError } from "./position-history-retention.types";

function telemetry() {
  return new PositionHistoryIngestionTelemetryService({ now: () => new Date("2026-09-14T12:00:00Z") });
}

function harness(options: Readonly<{ enabled?: boolean; plan?: unknown; result?: unknown; failure?: unknown }> = {}) {
  const tele = telemetry();
  const retention = {
    getRetentionPlan: async (): Promise<unknown> => {
      if (options.failure !== undefined && options.failure !== null && (options.failure as { phase?: string }).phase === "plan") throw options.failure;
      return options.plan ?? { policyReconciliation: { cursorFloorCandidates: 1, replayCheckpointCandidates: 0 }, checkpoints: { fullyObsolete: 0 }, observations: { executableObservationCandidates: 0 } };
    },
    executeAutomaticRetention: async (): Promise<unknown> => {
      if (options.failure !== undefined && options.failure !== null && (options.failure as { phase?: string }).phase !== "plan") throw options.failure;
      return options.result ?? { noWork: false };
    },
  } as unknown as PositionHistoryRetentionService;
  const config = { positionHistoryRetention: { enabled: options.enabled ?? true } } as ApiConfig;
  return { service: new PositionHistoryRetentionMaintenanceService(config, retention, tele), tele };
}

test("disabled scheduler tick never masquerades as retention execution", async () => {
  const item = harness({ enabled: false });
  assert.deepEqual(await item.service.scheduledEvaluate(), { outcome: "DISABLED", result: null });
  assert.equal(item.tele.snapshot().lastRetentionOutcome, "NOT_OBSERVED_THIS_PROCESS");
  assert.equal(item.tele.snapshot().lastRetentionAttemptAt, null);
});

test("successful automatic execution is recorded as success", async () => {
  const item = harness();
  const outcome = await item.service.scheduledEvaluate();
  assert.equal(outcome.outcome, "EXECUTED");
  assert.equal(item.tele.snapshot().lastRetentionOutcome, "SUCCESS");
  assert.ok(item.tele.snapshot().lastRetentionAttemptAt instanceof Date);
  assert.ok(item.tele.snapshot().lastRetentionCompletedAt instanceof Date);
});

test("empty automatic cycle is recorded as success without destructive work", async () => {
  const item = harness({ plan: { policyReconciliation: { cursorFloorCandidates: 0, replayCheckpointCandidates: 0 }, checkpoints: { fullyObsolete: 0 }, observations: { executableObservationCandidates: 0 } } });
  assert.equal((await item.service.scheduledEvaluate()).outcome, "NO_WORK");
  assert.equal(item.tele.snapshot().lastRetentionOutcome, "SUCCESS");
});

test("lock contention and active population are recorded as skipped with safe categories", async () => {
  const locked = harness({ failure: Object.assign(new PositionHistoryRetentionExecutionError("LOCK_UNAVAILABLE"), { phase: "execute" }) });
  assert.equal((await locked.service.scheduledEvaluate()).outcome, "LOCK_UNAVAILABLE");
  assert.equal(locked.tele.snapshot().lastRetentionOutcome, "SKIPPED");
  assert.equal(locked.tele.snapshot().lastRetentionSkipCategory, "LOCK_UNAVAILABLE");
  const active = harness({ failure: Object.assign(new PositionHistoryRetentionExecutionError("ACTIVE_DURABLE_RUN"), { phase: "execute" }) });
  assert.equal((await active.service.scheduledEvaluate()).outcome, "ACTIVE_POPULATION");
  assert.equal(active.tele.snapshot().lastRetentionSkipCategory, "ACTIVE_POPULATION");
});

test("unexpected execution failure is recorded as failed without raw leakage", async () => {
  const failure = Object.assign(new Error("synthetic retention boom"), { phase: "execute" });
  const item = harness({ failure });
  assert.equal((await item.service.scheduledEvaluate()).outcome, "FAILED_SAFE");
  assert.equal(item.tele.snapshot().lastRetentionOutcome, "FAILED");
  assert.equal(JSON.stringify(item.tele.snapshot()).includes("boom"), false);
});

test("next automatic execution derives the daily 06:00 UTC boundary truthfully", () => {
  assert.equal(nextAutomaticPositionHistoryRetentionExecutionAt(new Date("2026-09-14T05:59:59Z")).toISOString(), "2026-09-14T06:00:00.000Z");
  assert.equal(nextAutomaticPositionHistoryRetentionExecutionAt(new Date("2026-09-14T06:00:00Z")).toISOString(), "2026-09-15T06:00:00.000Z");
  assert.equal(nextAutomaticPositionHistoryRetentionExecutionAt(new Date("2026-09-14T12:00:00Z")).toISOString(), "2026-09-15T06:00:00.000Z");
});
