import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PositionHistoryRetentionService } from "./position-history-retention.service";
import type { PositionHistoryRetentionFacts, PositionHistoryRetentionRepository } from "./position-history-retention.types";

const facts: PositionHistoryRetentionFacts = {
  observations: { total: 12, olderThanPolicyCutoff: 5, atOrAfterPolicyCutoff: 7, oldestObservedAt: new Date("2026-04-01T00:00:00Z"), newestObservedAt: new Date("2026-08-13T00:00:00Z"), vehiclesWithObservationsOlderThanCutoff: 3, executableObservationCandidates: 2 },
  checkpoints: {
    total: 9, fullyObsolete: 3, boundaryOverlap: 2, protected: 4,
    fullyObsoleteByStatus: { pending: 1, running: 1, completed: 1 },
    boundaryOverlapByStatus: { pending: 0, running: 1, completed: 1 },
    protectedByStatus: { pending: 1, running: 1, completed: 2 },
    endingExactlyAtCutoff: 1, startingExactlyAtCutoff: 1, strictlyCrossingCutoff: 1,
  },
};
const lock = { runExclusive: async <T>(work: () => Promise<T>) => work() };

test("reuses the Stage 18C anchor and subtracts exactly 90 absolute UTC days", async () => {
  const cutoffs: string[] = [];
  const repository = { inspect: async (cutoff: Date) => { cutoffs.push(cutoff.toISOString()); return facts; } } as PositionHistoryRetentionRepository;
  const service = new PositionHistoryRetentionService(repository, { now: () => new Date("1999-01-01T00:00:00Z") }, lock as never);
  const plan = await service.getRetentionPlan(new Date("2026-08-13T10:15:16.789Z"));
  assert.equal(plan.policyDays, 90);
  assert.equal(plan.canonicalAnchor, "2026-08-11T02:00:00.000Z");
  assert.equal(plan.policyCutoff, "2026-05-13T02:00:00.000Z");
  assert.deepEqual(cutoffs, [plan.policyCutoff]);
  assert.equal(Date.parse(plan.canonicalAnchor) - Date.parse(plan.policyCutoff), 90 * 24 * 60 * 60 * 1_000);
  assert.equal(plan.safety.hasBoundaryOverlap, true);
  assert.equal(plan.safety.boundaryOverlapCheckpointCount, 2);
  assert.equal(plan.safety.policyEligibleObservationCount, 5);
  assert.equal(plan.safety.destructiveExecutionApproved, false);
});

test("policy is independent of local timezone, DST, and the history page anchor", async () => {
  const repository = { inspect: async () => facts } as unknown as PositionHistoryRetentionRepository;
  const service = new PositionHistoryRetentionService(repository, { now: () => new Date("2026-08-13T10:00:00Z") }, lock as never);
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
    observations: { total: 0, olderThanPolicyCutoff: 0, atOrAfterPolicyCutoff: 0, oldestObservedAt: null, newestObservedAt: null, vehiclesWithObservationsOlderThanCutoff: 0, executableObservationCandidates: 0 },
    checkpoints: { total: 0, fullyObsolete: 0, boundaryOverlap: 0, protected: 0, fullyObsoleteByStatus: { pending: 0, running: 0, completed: 0 }, boundaryOverlapByStatus: { pending: 0, running: 0, completed: 0 }, protectedByStatus: { pending: 0, running: 0, completed: 0 }, endingExactlyAtCutoff: 0, startingExactlyAtCutoff: 0, strictlyCrossingCutoff: 0 },
  };
  const plan = await new PositionHistoryRetentionService({ inspect: async () => empty } as unknown as PositionHistoryRetentionRepository, { now: () => new Date("2026-08-13T00:00:00Z") }, lock as never).getRetentionPlan();
  assert.equal(plan.observations.oldestObservedAt, null);
  assert.equal(plan.observations.newestObservedAt, null);
  assert.equal(plan.safety.hasBoundaryOverlap, false);
  assert.equal(plan.safety.destructiveExecutionApproved, false);
});
