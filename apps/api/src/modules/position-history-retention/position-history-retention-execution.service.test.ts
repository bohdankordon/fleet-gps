import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PositionHistoryHorizonAlreadyRunningError } from "../position-history-horizon-execution/position-history-horizon-execution-lock.service";
import { buildUserActor } from "../audit";
import { PositionHistoryRetentionService } from "./position-history-retention.service";
import { PositionHistoryRetentionExecutionError, type PositionHistoryRetentionFacts, type PositionHistoryRetentionRepository } from "./position-history-retention.types";

const anchor = new Date("2026-08-11T02:00:00.000Z");
const cutoff = new Date("2026-05-13T02:00:00.000Z");
const request = { expectedCanonicalAnchor: anchor, expectedPolicyCutoff: cutoff };
const actor = buildUserActor("00000000-0000-4000-8000-000000000001", "admin");

function facts(fullyObsolete: number, candidates: number): PositionHistoryRetentionFacts {
  return {
    observations: { total: candidates, olderThanPolicyCutoff: candidates, atOrAfterPolicyCutoff: 0, oldestObservedAt: null, newestObservedAt: null, vehiclesWithObservationsOlderThanCutoff: candidates > 0 ? 1 : 0, executableObservationCandidates: candidates },
    checkpoints: { total: fullyObsolete, fullyObsolete, boundaryOverlap: 0, protected: 0, fullyObsoleteByStatus: { pending: fullyObsolete, running: 0, completed: 0 }, boundaryOverlapByStatus: { pending: 0, running: 0, completed: 0 }, protectedByStatus: { pending: 0, running: 0, completed: 0 }, endingExactlyAtCutoff: 0, startingExactlyAtCutoff: 0, strictlyCrossingCutoff: 0 },
  };
}

type Scenario = Readonly<{ active?: number; fullyObsolete?: number; candidates?: number; deleteCheckpoints?: (limit: number, remaining: number) => number | Promise<number>; deleteObservations?: (limit: number, remaining: number) => number | Promise<number> }>;
function fixture(scenario: Scenario = {}, auditOverride?: { appendWithDatabase(event: unknown): Promise<unknown> }) {
  const events: string[] = [];
  const auditEvents: unknown[] = [];
  let remainingCheckpoints = scenario.fullyObsolete ?? 0;
  let remainingCandidates = scenario.candidates ?? 0;
  const repository: PositionHistoryRetentionRepository = {
    inspect: async () => { events.push("inspect"); return facts(remainingCheckpoints, remainingCandidates); },
    countActiveDurableRuns: async () => { events.push("active"); return scenario.active ?? 0; },
    deleteFullyObsoleteCheckpointBatch: async (_policyCutoff, limit) => { events.push(`delete-cp:${limit}`); const deleted = scenario.deleteCheckpoints ? await scenario.deleteCheckpoints(limit, remainingCheckpoints) : Math.min(limit, remainingCheckpoints); remainingCheckpoints -= deleted; return deleted; },
    countFullyObsoleteCheckpoints: async () => { events.push("count-cp"); return remainingCheckpoints; },
    deleteExecutableObservationBatch: async (_policyCutoff, limit) => { events.push(`delete-obs:${limit}`); const deleted = scenario.deleteObservations ? await scenario.deleteObservations(limit, remainingCandidates) : Math.min(limit, remainingCandidates); remainingCandidates -= deleted; return deleted; },
    countExecutableObservationCandidates: async () => { events.push("count-obs"); return remainingCandidates; },
  };
  const lock = { runExclusive: async <T>(work: () => Promise<T>): Promise<T> => { events.push("lock"); try { return await work(); } finally { events.push("unlock"); } } };
  const audit = auditOverride ?? { appendWithDatabase: async (event: unknown) => { auditEvents.push(event); return { id: "audit" }; } };
  return { service: new PositionHistoryRetentionService(repository, { now: () => new Date("2026-08-13T00:00:00Z") }, lock as never, audit as never), events, auditEvents };
}

test("fresh no-work execution performs no destructive repository call", async () => {
  const state = fixture();
  const result = await state.service.executeRetention(request);
  assert.deepEqual(result, { canonicalAnchor: anchor.toISOString(), policyCutoff: cutoff.toISOString(), deletedCheckpoints: 0, deletedObservations: 0, remainingFullyObsoleteCheckpoints: 0, remainingExecutableObservationCandidates: 0, stoppedByBudget: false, noWork: true });
  assert.equal(state.events.some((event) => event.startsWith("delete-")), false);
  assert.deepEqual(state.events, ["lock", "active", "inspect", "count-cp", "count-obs", "unlock"]);
});

test("successful manual disposable deletion appends exactly one factual RETENTION_EXECUTED audit", async () => {
  const state = fixture({ fullyObsolete: 2, candidates: 3 });
  const result = await state.service.executeRetention(request, actor);
  assert.equal(state.auditEvents.length, 1);
  const event = state.auditEvents[0] as { eventType: string; actor: { actorUserId: string; actorLoginSnapshot: string }; targetType: string; targetId: null; details: Record<string, unknown> };
  assert.equal(event.eventType, "RETENTION_EXECUTED");
  assert.equal(event.actor.actorUserId, actor.actorUserId);
  assert.equal(event.actor.actorLoginSnapshot, "admin");
  assert.equal(event.targetType, "POSITION_HISTORY_RETENTION");
  assert.equal(event.targetId, null);
  assert.deepEqual(event.details, {
    canonicalAnchor: result.canonicalAnchor,
    policyCutoff: result.policyCutoff,
    deletedCheckpoints: result.deletedCheckpoints,
    deletedObservations: result.deletedObservations,
    remainingFullyObsoleteCheckpoints: result.remainingFullyObsoleteCheckpoints,
    remainingExecutableObservationCandidates: result.remainingExecutableObservationCandidates,
    stoppedByBudget: result.stoppedByBudget,
  });
});

test("no-work and rejected manual retention paths write zero audit", async () => {
  const noWork = fixture();
  await noWork.service.executeRetention(request, actor);
  assert.equal(noWork.auditEvents.length, 0);

  const active = fixture({ active: 1, fullyObsolete: 1, candidates: 1 });
  await assert.rejects(active.service.executeRetention(request, actor), PositionHistoryRetentionExecutionError);
  assert.equal(active.auditEvents.length, 0);

  const stale = fixture({ fullyObsolete: 1, candidates: 1 });
  await assert.rejects(stale.service.executeRetention({ expectedCanonicalAnchor: new Date(anchor.getTime() - 1), expectedPolicyCutoff: cutoff }, actor), PositionHistoryRetentionExecutionError);
  assert.equal(stale.auditEvents.length, 0);
});

test("automatic Stage 19C execution writes zero audit even when deletions occur", async () => {
  const state = fixture({ fullyObsolete: 2, candidates: 3 });
  const result = await state.service.executeAutomaticRetention();
  assert.equal(result.deletedCheckpoints + result.deletedObservations > 0, true);
  assert.equal(state.auditEvents.length, 0);
});

test("partial destructive failure does not fabricate a success audit", async () => {
  let calls = 0;
  const state = fixture({ fullyObsolete: 1_001, candidates: 2, deleteCheckpoints: (limit) => { calls += 1; if (calls === 2) throw new Error("fixture failure"); return limit; } });
  await assert.rejects(state.service.executeRetention(request, actor), /fixture failure/);
  assert.equal(state.auditEvents.length, 0);
});

test("final audit failure does not compensate committed deletion and surfaces the ambiguous failure", async () => {
  const state = fixture({ fullyObsolete: 2, candidates: 3 }, { appendWithDatabase: async () => { throw new Error("final audit failure"); } });
  await assert.rejects(state.service.executeRetention(request, actor), /final audit failure/);
  assert.equal(state.events.filter((event) => event.startsWith("delete-cp")).length, 1);
  assert.equal(state.events.filter((event) => event.startsWith("delete-obs")).length, 1);
});

test("automatic execution shares the exact locked checkpoint-first destructive core without browser snapshot fields", async () => {
  const manual = fixture({ fullyObsolete: 501, candidates: 3 });
  const automatic = fixture({ fullyObsolete: 501, candidates: 3 });
  const manualResult = await manual.service.executeRetention(request);
  const automaticResult = await automatic.service.executeAutomaticRetention();
  assert.deepEqual(automaticResult, manualResult);
  assert.deepEqual(automatic.events, manual.events);
  assert.equal(automatic.events[0], "lock");
  assert.ok(automatic.events.indexOf("inspect") < automatic.events.findIndex((event) => event.startsWith("delete-cp")));
});

test("checkpoint truth commits first and final obsolete cleanup opens observation phase", async () => {
  const state = fixture({ fullyObsolete: 501, candidates: 3 });
  const result = await state.service.executeRetention(request);
  assert.equal(result.deletedCheckpoints, 501);
  assert.equal(result.deletedObservations, 3);
  assert.ok(state.events.indexOf("count-cp") < state.events.findIndex((event) => event.startsWith("delete-obs")));
  assert.deepEqual(state.events.filter((event) => event.startsWith("delete-cp")), ["delete-cp:500", "delete-cp:500"]);
});

test("5000 checkpoint budget is a hard barrier and leaves observations untouched while obsolete truth remains", async () => {
  const state = fixture({ fullyObsolete: 5_001, candidates: 20 });
  const result = await state.service.executeRetention(request);
  assert.equal(result.deletedCheckpoints, 5_000);
  assert.equal(result.remainingFullyObsoleteCheckpoints, 1);
  assert.equal(result.deletedObservations, 0);
  assert.equal(result.stoppedByBudget, true);
  assert.equal(state.events.filter((event) => event.startsWith("delete-cp")).length, 10);
  assert.equal(state.events.some((event) => event.startsWith("delete-obs")), false);
});

test("25000 observation budget never becomes 25001 and reports factual remainder", async () => {
  const state = fixture({ candidates: 25_001 });
  const result = await state.service.executeRetention(request);
  assert.equal(result.deletedObservations, 25_000);
  assert.equal(result.remainingExecutableObservationCandidates, 1);
  assert.equal(result.stoppedByBudget, true);
  assert.equal(state.events.filter((event) => event.startsWith("delete-obs")).length, 25);
});

test("active durable population and stale confirmations fail under the lock with zero delete", async () => {
  const active = fixture({ active: 1, fullyObsolete: 1, candidates: 1 });
  await assert.rejects(active.service.executeRetention(request), (error: unknown) => error instanceof PositionHistoryRetentionExecutionError && error.code === "ACTIVE_DURABLE_RUN");
  assert.equal(active.events.some((event) => event.startsWith("delete-")), false);

  for (const stale of [
    { expectedCanonicalAnchor: new Date(anchor.getTime() - 1), expectedPolicyCutoff: cutoff },
    { expectedCanonicalAnchor: anchor, expectedPolicyCutoff: new Date(cutoff.getTime() - 1) },
  ]) {
    const state = fixture({ fullyObsolete: 1, candidates: 1 });
    await assert.rejects(state.service.executeRetention(stale), (error: unknown) => error instanceof PositionHistoryRetentionExecutionError && error.code === "STALE_PLAN");
    assert.equal(state.events.some((event) => event.startsWith("delete-")), false);
  }
});

test("shared lock conflict maps to the retention conflict and executes zero repository work", async () => {
  const repository = { inspect: async () => { throw new Error("should not run"); } } as unknown as PositionHistoryRetentionRepository;
  const lock = { runExclusive: async () => { throw new PositionHistoryHorizonAlreadyRunningError(); } };
  const service = new PositionHistoryRetentionService(repository, { now: () => new Date() }, lock as never, { appendWithDatabase: async () => ({ id: "audit" }) } as never);
  await assert.rejects(service.executeRetention(request), (error: unknown) => error instanceof PositionHistoryRetentionExecutionError && error.code === "LOCK_UNAVAILABLE");
  await assert.rejects(service.executeAutomaticRetention(), (error: unknown) => error instanceof PositionHistoryRetentionExecutionError && error.code === "LOCK_UNAVAILABLE");
});

test("automatic execution preserves the active durable guard and never performs stale-browser validation", async () => {
  const active = fixture({ active: 1, fullyObsolete: 1, candidates: 1 });
  await assert.rejects(active.service.executeAutomaticRetention(), (error: unknown) => error instanceof PositionHistoryRetentionExecutionError && error.code === "ACTIVE_DURABLE_RUN");
  assert.deepEqual(active.events, ["lock", "active", "unlock"]);
});

test("automatic guard blocks USER and SYSTEM PENDING/RUNNING while terminal-only history does not block", async (context) => {
  for (const initiator of ["USER", "SYSTEM"] as const) {
    for (const status of ["PENDING", "RUNNING"] as const) {
      await context.test(`${initiator} ${status}`, async () => {
        const state = fixture({ active: 1, fullyObsolete: 1, candidates: 1 });
        await assert.rejects(state.service.executeAutomaticRetention(), (error: unknown) => error instanceof PositionHistoryRetentionExecutionError && error.code === "ACTIVE_DURABLE_RUN");
        assert.equal(state.events.some((event) => event.startsWith("delete-")), false);
      });
    }
  }
  for (const status of ["SUCCEEDED", "FAILED"] as const) {
    await context.test(`${status} only`, async () => {
      const state = fixture({ active: 0 });
      assert.equal((await state.service.executeAutomaticRetention()).noWork, true);
    });
  }
});

test("manual and automatic paths contain only one destructive implementation and the same fixed budgets", () => {
  const source = readFileSync("src/modules/position-history-retention/position-history-retention.service.ts", "utf8");
  assert.equal((source.match(/deleteFullyObsoleteCheckpointBatch\(/g) ?? []).length, 1);
  assert.equal((source.match(/deleteExecutableObservationBatch\(/g) ?? []).length, 1);
  assert.equal((source.match(/executeBoundedDestructivePass\(plan\)/g) ?? []).length, 1);
  assert.match(source, /POSITION_HISTORY_RETENTION_CHECKPOINT_BUDGET/);
  assert.match(source, /POSITION_HISTORY_RETENTION_OBSERVATION_BUDGET/);
});

test("checkpoint batch failure never reaches observations and committed partial progress is not compensated", async () => {
  let calls = 0;
  const state = fixture({ fullyObsolete: 1_001, candidates: 2, deleteCheckpoints: (limit) => { calls += 1; if (calls === 2) throw new Error("fixture failure"); return limit; } });
  await assert.rejects(state.service.executeRetention(request), /fixture failure/);
  assert.equal(state.events.some((event) => event.startsWith("delete-obs")), false);
  assert.equal(state.events.includes("unlock"), true);
});

test("automatic observation partial commits survive failure and a later independent invocation replans current truth", async () => {
  let calls = 0;
  const state = fixture({ candidates: 1_500, deleteObservations: (limit, remaining) => { calls += 1; if (calls === 2) throw new Error("fixture observation failure"); return Math.min(limit, remaining); } });
  await assert.rejects(state.service.executeAutomaticRetention(), /fixture observation failure/);
  assert.equal(state.events.filter((event) => event.startsWith("delete-obs")).length, 2);
  assert.equal(state.events.includes("unlock"), true);
  const result = await state.service.executeAutomaticRetention();
  assert.equal(result.deletedObservations, 500);
  assert.equal(result.remainingExecutableObservationCandidates, 0);
  assert.equal(state.events.filter((event) => event === "lock").length, 2);
});
