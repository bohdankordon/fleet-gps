import assert from "node:assert/strict";
import test from "node:test";
import { parseVehicleTrackOverviewRange, VEHICLE_TRACK_OVERVIEW_MAX_RANGE_MS } from "./vehicle-track-overview-query-params";

test("requires strict absolute non-empty ranges no longer than exactly seven elapsed days", () => {
  const from = "2026-08-01T00:00:00Z";
  for (const [invalidFrom, invalidTo] of [
    [undefined, "2026-08-02T00:00:00Z"],
    [from, undefined],
    ["2026-08-01T00:00:00", "2026-08-02T00:00:00Z"],
    ["2026-02-30T00:00:00Z", "2026-08-02T00:00:00Z"],
    [from, from],
    ["2026-08-02T00:00:00Z", from],
    [from, "2026-08-08T00:00:00.001Z"],
  ] as const) assert.equal(parseVehicleTrackOverviewRange(invalidFrom, invalidTo), null);

  const exact = parseVehicleTrackOverviewRange(from, "2026-08-08T00:00:00Z");
  if (!exact) assert.fail("Expected exact seven-day range");
  assert.equal(exact.to.getTime() - exact.from.getTime(), VEHICLE_TRACK_OVERVIEW_MAX_RANGE_MS);
  assert.ok(parseVehicleTrackOverviewRange("2030-01-01T00:00:00Z", "2030-01-02T00:00:00Z"));
});
