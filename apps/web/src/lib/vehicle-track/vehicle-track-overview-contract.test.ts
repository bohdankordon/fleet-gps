import assert from "node:assert/strict";
import test from "node:test";
import { overviewSegment, overviewTrackFixture, trackPoint } from "./vehicle-track-fixture";
import { parseVehicleTrackOverviewResponse, VehicleTrackOverviewContractError } from "./vehicle-track-overview-contract";

test("accepts valid empty, single, multiple segments, and nullable selected quality", () => {
  assert.equal(parseVehicleTrackOverviewResponse(overviewTrackFixture()).summary.sampled, true);
  const first = overviewSegment([trackPoint("2026-08-01T00:00:00Z", { valid: false, outdated: null })], 10);
  const second = overviewSegment([trackPoint("2026-08-01T00:10:00Z", { longitude: 28.5 }), trackPoint("2026-08-01T00:30:00Z", { speedKph: 0, valid: true, outdated: false })], 20);
  const parsed = parseVehicleTrackOverviewResponse(overviewTrackFixture([first, second], 7));
  assert.equal(parsed.segments.length, 2); assert.equal(parsed.summary.rawPointCount, 30); assert.equal(parsed.summary.returnedPointCount, 3); assert.equal(parsed.summary.qualityWarningCount, 7);
});

test("requires sampled=true and rejects unknown fields, bad counts, sums, gaps, boundaries, ordering, coordinates, and timestamps", () => {
  const first = overviewSegment([trackPoint("2026-08-01T00:00:00Z"), trackPoint("2026-08-01T00:20:00Z", { longitude: 28.5 })], 5);
  const second = overviewSegment([trackPoint("2026-08-01T00:25:01Z", { longitude: 28.6 })], 2);
  const base = overviewTrackFixture([first, second]);
  const cases: unknown[] = [
    { ...base, summary: { ...base.summary, sampled: false } },
    { ...base, secret: "internal" },
    { ...base, segments: [{ ...base.segments[0], providerId: 1 }, base.segments[1]] },
    { ...base, summary: { ...base.summary, segmentCount: 1 } },
    { ...base, summary: { ...base.summary, rawPointCount: 6 } },
    { ...base, summary: { ...base.summary, returnedPointCount: 2 } },
    { ...base, summary: { ...base.summary, gapCount: 0 } },
    { ...base, summary: { ...base.summary, qualityWarningCount: 8 } },
    { ...base, summary: { ...base.summary, firstObservedAt: "2026-08-01T00:00:01Z" } },
    { ...base, segments: [{ ...base.segments[0], rawPointCount: 1 }, base.segments[1]] },
    { ...base, segments: [{ ...base.segments[0], points: [base.segments[0]!.points[1]!, base.segments[0]!.points[0]!] }, base.segments[1]] },
    { ...base, segments: [{ ...base.segments[0], points: [{ ...base.segments[0]!.points[0]!, latitude: 91 }, base.segments[0]!.points[1]!] }, base.segments[1]] },
    { ...base, segments: [{ ...base.segments[0], firstObservedAt: "bad" }, base.segments[1]] },
    { ...base, segments: [base.segments[1], base.segments[0]] },
  ];
  for (const value of cases) assert.throws(() => parseVehicleTrackOverviewResponse(value), VehicleTrackOverviewContractError);
});
