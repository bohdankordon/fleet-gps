import assert from "node:assert/strict";
import test from "node:test";
import { parsePositionHistoryRetentionExecutionRequest } from "./position-history-retention-execution.validation";

const valid = { expectedCanonicalAnchor: "2026-08-11T02:00:00.000Z", expectedPolicyCutoff: "2026-05-13T02:00:00.000Z" };

test("strict execution DTO accepts only the two optimistic absolute timestamp guards", () => {
  const parsed = parsePositionHistoryRetentionExecutionRequest(valid);
  assert.equal(parsed?.expectedCanonicalAnchor.toISOString(), valid.expectedCanonicalAnchor);
  assert.equal(parsed?.expectedPolicyCutoff.toISOString(), valid.expectedPolicyCutoff);
  for (const value of [
    null, [], {},
    { expectedPolicyCutoff: valid.expectedPolicyCutoff },
    { expectedCanonicalAnchor: valid.expectedCanonicalAnchor },
    { ...valid, expectedCanonicalAnchor: "2026-08-11T02:00:00" },
    { ...valid, expectedPolicyCutoff: "not-a-time" },
    ...["windowBudget", "checkpointBudget", "observationBudget", "days", "retentionDays", "cutoff", "to", "initiatorType", "requestedByUserId", "unknown"].map((field) => ({ ...valid, [field]: 1 })),
  ]) assert.equal(parsePositionHistoryRetentionExecutionRequest(value), null);
});
