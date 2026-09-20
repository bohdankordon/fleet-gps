import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildUserActor } from "../audit";
import { PositionHistoryHorizonAlreadyRunningError } from "../position-history-horizon-execution/position-history-horizon-execution-lock.service";
import { PositionHistoryRetentionService } from "./position-history-retention.service";
import { PositionHistoryRetentionExecutionError, type PositionHistoryRetentionRepository } from "./position-history-retention.types";

const anchor = new Date("2026-08-11T02:00:00.000Z");
const cutoff = new Date("2026-05-13T02:00:00.000Z");
const request = { expectedCanonicalAnchor: anchor, expectedPolicyCutoff: cutoff };
const actor = buildUserActor("00000000-0000-4000-8000-000000000001", "admin");

type Scenario = Readonly<{
  active?: number;
  checkpoints?: number;
  observations?: number;
  advancedCursorFloors?: number;
  advancedReplayCheckpoints?: number;
  completedReplayCheckpoints?: number;
  reconciliationFailure?: Error;
  deleteCheckpoints?: (limit: number, remaining: number) => number | Promise<number>;
  deleteObservations?: (limit: number, remaining: number) => number | Promise<number>;
}>;

function fixture(scenario: Scenario = {}, auditOverride?: { appendWithDatabase(event: unknown): Promise<unknown> }) {
  const events: string[] = [];
  const auditEvents: unknown[] = [];
  let checkpoints = scenario.checkpoints ?? 0;
  let observations = scenario.observations ?? 0;
  const repository: PositionHistoryRetentionRepository = {
    inspect: async () => { events.push("inspect"); throw new Error("execution must not inspect the operator plan"); },
    inspectPrecheck: async () => { events.push("precheck"); throw new Error("execution must not repeat the automatic precheck"); },
    countActiveDurableRuns: async () => { events.push("active"); return scenario.active ?? 0; },
    reconcilePolicyFloor: async () => {
      events.push("reconcile");
      if (scenario.reconciliationFailure) throw scenario.reconciliationFailure;
      return { advancedCursorFloors: scenario.advancedCursorFloors ?? 0, advancedReplayCheckpoints: scenario.advancedReplayCheckpoints ?? 0, completedReplayCheckpoints: scenario.completedReplayCheckpoints ?? 0 };
    },
    deleteFullyObsoleteCheckpointBatch: async (_policyCutoff, limit) => {
      events.push(`delete-cp:${limit}`);
      const deleted = scenario.deleteCheckpoints ? await scenario.deleteCheckpoints(limit, checkpoints) : Math.min(limit, checkpoints);
      checkpoints -= deleted;
      return deleted;
    },
    deleteExecutableObservationBatch: async (_policyCutoff, limit) => {
      events.push(`delete-obs:${limit}`);
      const deleted = scenario.deleteObservations ? await scenario.deleteObservations(limit, observations) : Math.min(limit, observations);
      observations -= deleted;
      return deleted;
    },
  };
  const lock = { runExclusive: async <T>(work: () => Promise<T>): Promise<T> => { events.push("lock"); try { return await work(); } finally { events.push("unlock"); } } };
  const audit = auditOverride ?? { appendWithDatabase: async (event: unknown) => { auditEvents.push(event); return { id: "audit" }; } };
  return { service: new PositionHistoryRetentionService(repository, { now: () => new Date("2026-08-13T00:00:00Z") }, lock as never, audit as never), events, auditEvents };
}

test("zero checkpoint and observation work is proved by short batches", async () => {
  const state = fixture();
  const result = await state.service.executeRetention(request);
  assert.deepEqual(result, { canonicalAnchor: anchor.toISOString(), policyCutoff: cutoff.toISOString(), advancedCursorFloors: 0, advancedReplayCheckpoints: 0, completedReplayCheckpoints: 0, deletedCheckpoints: 0, deletedObservations: 0, moreCheckpointWork: false, moreObservationWork: false, stoppedByBudget: false, noWork: true });
  assert.deepEqual(state.events, ["lock", "active", "reconcile", "delete-cp:500", "delete-obs:1000", "unlock"]);
});

test("checkpoint short batch exhausts the phase and opens observation deletion", async () => {
  const state = fixture({ checkpoints: 501, observations: 3 });
  const result = await state.service.executeRetention(request);
  assert.equal(result.deletedCheckpoints, 501);
  assert.equal(result.deletedObservations, 3);
  assert.equal(result.moreCheckpointWork, false);
  assert.deepEqual(state.events.filter((event) => event.startsWith("delete-cp")), ["delete-cp:500", "delete-cp:500"]);
  assert.ok(state.events.indexOf("delete-cp:500") < state.events.indexOf("delete-obs:1000"));
});

test("a full 5000 checkpoint budget is conservative and does not enter observations", async () => {
  const state = fixture({ checkpoints: 5_000, observations: 20 });
  const result = await state.service.executeRetention(request);
  assert.equal(result.deletedCheckpoints, 5_000);
  assert.equal(result.deletedObservations, 0);
  assert.equal(result.moreCheckpointWork, true);
  assert.equal(result.moreObservationWork, null);
  assert.equal(result.stoppedByBudget, true);
  assert.equal(state.events.filter((event) => event.startsWith("delete-cp")).length, 10);
  assert.equal(state.events.some((event) => event.startsWith("delete-obs")), false);
});

test("observation short batches prove exhaustion after zero, one, or multiple batches", async (context) => {
  for (const count of [0, 3, 1_500]) {
    await context.test(String(count), async () => {
      const result = await fixture({ observations: count }).service.executeRetention(request);
      assert.equal(result.deletedObservations, count);
      assert.equal(result.moreObservationWork, false);
      assert.equal(result.stoppedByBudget, false);
    });
  }
});

test("a full 25000 observation budget reports conservative more-work without a recount", async () => {
  const state = fixture({ observations: 25_000 });
  const result = await state.service.executeRetention(request);
  assert.equal(result.deletedObservations, 25_000);
  assert.equal(result.moreObservationWork, true);
  assert.equal(result.stoppedByBudget, true);
  assert.equal(state.events.filter((event) => event.startsWith("delete-obs")).length, 25);
  assert.equal(state.events.some((event) => event.startsWith("count-")), false);
});

test("reconciliation occurs before deletion and contributes to noWork semantics", async () => {
  const state = fixture({ advancedCursorFloors: 2, advancedReplayCheckpoints: 3, completedReplayCheckpoints: 1 });
  const result = await state.service.executeRetention(request);
  assert.deepEqual({ cursors: result.advancedCursorFloors, replay: result.advancedReplayCheckpoints, completed: result.completedReplayCheckpoints, noWork: result.noWork }, { cursors: 2, replay: 3, completed: 1, noWork: false });
  assert.ok(state.events.indexOf("reconcile") < state.events.indexOf("delete-cp:500"));
});

test("reconciliation failure prevents destructive deletion", async () => {
  const failure = new Error("policy reconciliation failure");
  const state = fixture({ reconciliationFailure: failure });
  await assert.rejects(state.service.executeRetention(request), failure);
  assert.equal(state.events.some((event) => event.startsWith("delete-")), false);
});

test("manual staleness is checked under the lock before reconciliation or deletion", async () => {
  for (const stale of [
    { expectedCanonicalAnchor: new Date(anchor.getTime() - 1), expectedPolicyCutoff: cutoff },
    { expectedCanonicalAnchor: anchor, expectedPolicyCutoff: new Date(cutoff.getTime() - 1) },
  ]) {
    const state = fixture({ checkpoints: 1, observations: 1 });
    await assert.rejects(state.service.executeRetention(stale), (error: unknown) => error instanceof PositionHistoryRetentionExecutionError && error.code === "STALE_PLAN");
    assert.deepEqual(state.events, ["lock", "active", "unlock"]);
  }
  assert.equal((await fixture().service.executeRetention(request)).policyCutoff, cutoff.toISOString());
});

test("active durable runs and lock conflicts remain fail-safe", async () => {
  const active = fixture({ active: 1, checkpoints: 1 });
  await assert.rejects(active.service.executeAutomaticRetention(), (error: unknown) => error instanceof PositionHistoryRetentionExecutionError && error.code === "ACTIVE_DURABLE_RUN");
  assert.deepEqual(active.events, ["lock", "active", "unlock"]);

  const lock = { runExclusive: async () => { throw new PositionHistoryHorizonAlreadyRunningError(); } };
  const repository = {} as PositionHistoryRetentionRepository;
  const service = new PositionHistoryRetentionService(repository, { now: () => new Date() }, lock as never, { appendWithDatabase: async () => ({ id: "audit" }) } as never);
  await assert.rejects(service.executeRetention(request), (error: unknown) => error instanceof PositionHistoryRetentionExecutionError && error.code === "LOCK_UNAVAILABLE");
});

test("manual and automatic deletion share one locked core and never build a preview", async () => {
  const manual = fixture({ checkpoints: 2, observations: 3 });
  const automatic = fixture({ checkpoints: 2, observations: 3 });
  assert.deepEqual(await automatic.service.executeAutomaticRetention(), await manual.service.executeRetention(request));
  assert.deepEqual(automatic.events, manual.events);
  assert.equal(automatic.events.includes("inspect"), false);
  assert.equal(automatic.events.includes("precheck"), false);
  const source = readFileSync("src/modules/position-history-retention/position-history-retention.service.ts", "utf8");
  assert.equal((source.match(/deleteFullyObsoleteCheckpointBatch\(/g) ?? []).length, 1);
  assert.equal((source.match(/deleteExecutableObservationBatch\(/g) ?? []).length, 1);
  assert.equal((source.match(/getRetentionPlan\(/g) ?? []).length, 1);
  assert.doesNotMatch(source, /countFullyObsoleteCheckpoints|countExecutableObservationCandidates/);
});

test("new audit events record actual deletes and conservative work state", async () => {
  const state = fixture({ checkpoints: 2, observations: 3 });
  const result = await state.service.executeRetention(request, actor);
  assert.equal(state.auditEvents.length, 1);
  const event = state.auditEvents[0] as { eventType: string; details: Record<string, unknown> };
  assert.equal(event.eventType, "RETENTION_EXECUTED");
  assert.deepEqual(event.details, {
    canonicalAnchor: result.canonicalAnchor,
    policyCutoff: result.policyCutoff,
    deletedCheckpoints: 2,
    deletedObservations: 3,
    moreCheckpointWork: false,
    moreObservationWork: false,
    stoppedByBudget: false,
  });
});

test("true no-work emits no audit, while committed automatic deletion emits one system audit", async () => {
  const noWork = fixture();
  await noWork.service.executeRetention(request, actor);
  assert.equal(noWork.auditEvents.length, 0);

  const automatic = fixture({ observations: 1 });
  await automatic.service.executeAutomaticRetention();
  assert.equal((automatic.auditEvents[0] as { eventType: string }).eventType, "AUTOMATIC_RETENTION_EXECUTED");
});

test("batch and audit failures are not compensated or mislabeled", async () => {
  let calls = 0;
  const partial = fixture({ checkpoints: 1_001, deleteCheckpoints: (limit) => { calls += 1; if (calls === 2) throw new Error("fixture failure"); return limit; } });
  await assert.rejects(partial.service.executeRetention(request, actor), /fixture failure/);
  assert.equal(partial.auditEvents.length, 0);
  assert.equal(partial.events.some((event) => event.startsWith("delete-obs")), false);

  const failedAudit = fixture({ observations: 1 }, { appendWithDatabase: async () => { throw new Error("audit failure"); } });
  await assert.rejects(failedAudit.service.executeAutomaticRetention(), /audit failure/);
  assert.equal(failedAudit.events.filter((event) => event.startsWith("delete-obs")).length, 1);
});
