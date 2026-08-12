import assert from "node:assert/strict";
import test from "node:test";
import { parseTripAnalysisResponse, TripAnalysisContractError } from "./trip-analysis-contract";
import { tripAnalysisFixture } from "./trip-analysis-fixture";
test("accepts the truthful product contract and rejects internal/misleading clipping fields", () => { assert.deepEqual(parseTripAnalysisResponse(tripAnalysisFixture()), tripAnalysisFixture()); for (const key of ["startClipped", "endsAtRangeBoundary", "startsAtRangeBoundary"]) assert.throws(() => parseTripAnalysisResponse({ ...tripAnalysisFixture(), trips: [{ ...tripAnalysisFixture().trips[0], [key]: true }] }), TripAnalysisContractError); });
test("rejects fabricated end/duration, inconsistent clipping, counts, and ranges over seven days", () => { const base = tripAnalysisFixture(); for (const value of [{ ...base, trips: [{ ...base.trips[0], endAt: base.to }] }, { ...base, trips: [{ ...base.trips[0], endClipped: false }] }, { ...base, summary: { ...base.summary, tripCount: 2 } }, { ...base, to: "2026-08-08T00:00:00.001Z" }]) assert.throws(() => parseTripAnalysisResponse(value), TripAnalysisContractError); });

