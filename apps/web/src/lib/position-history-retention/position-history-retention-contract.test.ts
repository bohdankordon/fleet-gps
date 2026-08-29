import assert from "node:assert/strict";
import test from "node:test";
import { positionHistoryRetentionPlanSchema } from "./position-history-retention-contract";
import { positionHistoryRetentionFixture } from "./position-history-retention-fixture";

test("accepts a server-owned operator retention policy and a consistent aggregate DTO", () => {
  assert.equal(positionHistoryRetentionPlanSchema.safeParse(positionHistoryRetentionFixture()).success, true);
  const fixture = positionHistoryRetentionFixture();
  assert.equal(positionHistoryRetentionPlanSchema.safeParse({ ...fixture, policyDays: 365 }).success, true);
  for (const invalid of [
    { ...fixture, policyDays: 0 },
    { ...fixture, observations: { ...fixture.observations, atOrAfterPolicyCutoff: 79 } },
    { ...fixture, checkpoints: { ...fixture.checkpoints, boundaryOverlap: 3 } },
    { ...fixture, externalDeviceId: 12 },
  ]) assert.equal(positionHistoryRetentionPlanSchema.safeParse(invalid).success, false);
});

test("safe DTO cannot expose coordinates, fingerprints, identifiers, provider data, or cursors", () => {
  const fixture = positionHistoryRetentionFixture();
  for (const field of ["vehicleId", "externalDeviceId", "latitude", "longitude", "fixFingerprint", "nextFrom", "providerPayload", "taxi_session"]) assert.equal(positionHistoryRetentionPlanSchema.safeParse({ ...fixture, [field]: "secret" }).success, false, field);
});
