import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { POSITION_HISTORY_ABSOLUTE_DAY_MS, POSITION_HISTORY_POLICY_DAYS } from "../position-history-horizon/position-history-horizon.policy";
import { PositionHistoryRetentionService } from "./position-history-retention.service";
import type { PositionHistoryRetentionFacts, PositionHistoryRetentionRepository } from "./position-history-retention.types";

const facts: PositionHistoryRetentionFacts = {
  policyReconciliation: { cursorFloorCandidates: 2, replayCheckpointCandidates: 3 },
  observations: { oldestObservedAt: new Date("2026-04-01T00:00:00Z"), newestObservedAt: new Date("2026-08-13T00:00:00Z"), hasExecutableWork: true },
  checkpoints: {
    total: 9, fullyObsolete: 3, boundaryOverlap: 2, protected: 4,
    fullyObsoleteByStatus: { pending: 1, running: 1, completed: 1 },
    boundaryOverlapByStatus: { pending: 0, running: 1, completed: 1 },
    protectedByStatus: { pending: 1, running: 1, completed: 2 },
    endingExactlyAtCutoff: 1, startingExactlyAtCutoff: 1, strictlyCrossingCutoff: 1,
  },
};
const lock = { runExclusive: async <T>(work: () => Promise<T>) => work() };
const audit = { appendWithDatabase: async () => ({ id: "audit" }) };

test("reuses the shared history policy for the retention cutoff", async () => {
  const cutoffs: string[] = [];
  const repository = { inspect: async (cutoff: Date) => { cutoffs.push(cutoff.toISOString()); return facts; } } as PositionHistoryRetentionRepository;
  const service = new PositionHistoryRetentionService(repository, { now: () => new Date("1999-01-01T00:00:00Z") }, lock as never, audit as never);
  const plan = await service.getRetentionPlan(new Date("2026-08-13T10:15:16.789Z"));
  assert.equal(plan.policyDays, POSITION_HISTORY_POLICY_DAYS);
  assert.equal(plan.canonicalAnchor, "2026-08-11T02:00:00.000Z");
  assert.equal(plan.policyCutoff, "2026-05-13T02:00:00.000Z");
  assert.deepEqual(plan.policyReconciliation, { cursorFloorCandidates: 2, replayCheckpointCandidates: 3 });
  assert.deepEqual(cutoffs, [plan.policyCutoff]);
  assert.equal(Date.parse(plan.canonicalAnchor) - Date.parse(plan.policyCutoff), POSITION_HISTORY_POLICY_DAYS * POSITION_HISTORY_ABSOLUTE_DAY_MS);
  assert.equal(plan.observations.hasExecutableWork, true);
  assert.equal("safety" in plan, false);
});

test("policy is independent of local timezone, DST, and the history page anchor", async () => {
  const repository = { inspect: async () => facts } as unknown as PositionHistoryRetentionRepository;
  const service = new PositionHistoryRetentionService(repository, { now: () => new Date("2026-08-13T10:00:00Z") }, lock as never, audit as never);
  const original = process.env.TZ;
  try {
    for (const timezone of ["UTC", "Europe/Kyiv", "America/New_York"]) {
      process.env.TZ = timezone;
      const plan = await service.getRetentionPlan();
      assert.equal(plan.policyCutoff, "2026-05-13T02:00:00.000Z");
    }
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
  const source = readFileSync("src/modules/position-history-retention/position-history-retention.service.ts", "utf8");
  assert.match(source, /canonicalPositionHistoryMaintenanceAnchor/);
  assert.doesNotMatch(source, /Tuesday|TUESDAY|Europe\/Kyiv|setUTCMonth|setMonth|@Query|searchParams|rawTo/);
});

test("empty facts retain nullable extrema and do not manufacture overlap safety", async () => {
  const empty: PositionHistoryRetentionFacts = {
    policyReconciliation: { cursorFloorCandidates: 0, replayCheckpointCandidates: 0 },
    observations: { oldestObservedAt: null, newestObservedAt: null, hasExecutableWork: false },
    checkpoints: { total: 0, fullyObsolete: 0, boundaryOverlap: 0, protected: 0, fullyObsoleteByStatus: { pending: 0, running: 0, completed: 0 }, boundaryOverlapByStatus: { pending: 0, running: 0, completed: 0 }, protectedByStatus: { pending: 0, running: 0, completed: 0 }, endingExactlyAtCutoff: 0, startingExactlyAtCutoff: 0, strictlyCrossingCutoff: 0 },
  };
  const plan = await new PositionHistoryRetentionService({ inspect: async () => empty } as unknown as PositionHistoryRetentionRepository, { now: () => new Date("2026-08-13T00:00:00Z") }, lock as never, audit as never).getRetentionPlan();
  assert.equal(plan.observations.oldestObservedAt, null);
  assert.equal(plan.observations.newestObservedAt, null);
  assert.equal(plan.observations.hasExecutableWork, false);
});

test("automatic precheck uses the same policy floor without building the operator plan", async () => {
  const calls: string[] = [];
  const repository = {
    inspect: async () => { calls.push("inspect"); return facts; },
    inspectPrecheck: async (value: Date) => { calls.push(`precheck:${value.toISOString()}`); return { cursorFloorCandidates: 0, replayCheckpointCandidates: 0, hasFullyObsoleteCheckpoints: false, hasExecutableObservationWork: false }; },
  } as unknown as PositionHistoryRetentionRepository;
  const service = new PositionHistoryRetentionService(repository, { now: () => new Date("2026-08-13T00:00:00Z") }, lock as never, audit as never);
  assert.equal((await service.getRetentionPrecheck()).hasExecutableObservationWork, false);
  assert.deepEqual(calls, ["precheck:2026-05-13T02:00:00.000Z"]);
});
