import assert from "node:assert/strict";
import test from "node:test";
import { positionHistoryRetentionExecutionResultSchema, positionHistoryRetentionPlanSchema } from "./position-history-retention-contract";
import { positionHistoryRetentionFixture } from "./position-history-retention-fixture";

test("accepts a server-owned operator retention policy and a consistent aggregate DTO", () => {
  assert.equal(positionHistoryRetentionPlanSchema.safeParse(positionHistoryRetentionFixture()).success, true);
  const fixture = positionHistoryRetentionFixture();
  assert.equal(positionHistoryRetentionPlanSchema.safeParse({ ...fixture, policyDays: 365 }).success, true);
  for (const invalid of [
    { ...fixture, policyDays: 0 },
    { ...fixture, observations: { ...fixture.observations, atOrAfterPolicyCutoff: 79 } },
    { ...fixture, checkpoints: { ...fixture.checkpoints, boundaryOverlap: 3 } },
    { ...fixture, policyReconciliation: { ...fixture.policyReconciliation, cursorFloorCandidates: -1 } },
    { ...fixture, externalDeviceId: 12 },
  ]) assert.equal(positionHistoryRetentionPlanSchema.safeParse(invalid).success, false);
});

test("accepts the complete API execution result and enforces reconciliation invariants", () => {
  const result = {
    canonicalAnchor: "2026-08-11T02:00:00.000Z",
    policyCutoff: "2026-05-13T02:00:00.000Z",
    advancedCursorFloors: 1,
    advancedReplayCheckpoints: 2,
    completedReplayCheckpoints: 1,
    deletedCheckpoints: 3,
    deletedObservations: 4,
    remainingFullyObsoleteCheckpoints: 0,
    remainingExecutableObservationCandidates: 0,
    stoppedByBudget: false,
    noWork: false,
  };
  assert.equal(positionHistoryRetentionExecutionResultSchema.safeParse(result).success, true);
  assert.equal(positionHistoryRetentionExecutionResultSchema.safeParse({ ...result, completedReplayCheckpoints: 3 }).success, false);
  assert.equal(positionHistoryRetentionExecutionResultSchema.safeParse({ ...result, advancedCursorFloors: -1 }).success, false);
  assert.equal(positionHistoryRetentionExecutionResultSchema.safeParse({ ...result, extra: true }).success, false);
  assert.equal(positionHistoryRetentionExecutionResultSchema.safeParse({ ...result, advancedCursorFloors: 0, advancedReplayCheckpoints: 0, completedReplayCheckpoints: 0, deletedCheckpoints: 0, deletedObservations: 0, noWork: true }).success, true);
  assert.equal(positionHistoryRetentionExecutionResultSchema.safeParse({ ...result, noWork: true }).success, false);
});

test("safe DTO cannot expose coordinates, fingerprints, identifiers, provider data, or cursors", () => {
  const fixture = positionHistoryRetentionFixture();
  for (const field of ["vehicleId", "externalDeviceId", "latitude", "longitude", "fixFingerprint", "nextFrom", "providerPayload", "taxi_session"]) assert.equal(positionHistoryRetentionPlanSchema.safeParse({ ...fixture, [field]: "secret" }).success, false, field);
});
