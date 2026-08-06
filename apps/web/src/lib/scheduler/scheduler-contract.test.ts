import assert from "node:assert/strict";
import test from "node:test";
import { SchedulerContractError, parseSchedulerStatusResponse } from "./scheduler-contract";
import { validSchedulerStatus } from "./scheduler-fixture";

test("scheduler contract accepts valid response", () => { assert.equal(parseSchedulerStatusResponse(validSchedulerStatus).enabled, true); });
test("scheduler contract rejects invalid enum, timestamps and negative counters", () => {
  for (const value of [{ ...validSchedulerStatus, fleet: { ...validSchedulerStatus.fleet, lastFailureCategory: "other" } }, { ...validSchedulerStatus, generatedAt: "2026-08-05T00:00:00+03:00" }, { ...validSchedulerStatus, runs: { ...validSchedulerStatus.runs, failedRuns: -1 } }]) assert.throws(() => parseSchedulerStatusResponse(value), SchedulerContractError);
});
