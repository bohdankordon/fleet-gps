import assert from "node:assert/strict";
import test from "node:test";
import { parseAbsoluteTimestamp, parseVehicleTrackRange, VEHICLE_TRACK_MAX_RANGE_MS } from "./vehicle-track-query-params";

test("accepts strict absolute timestamps, leap dates, offsets, and millisecond precision", () => {
  assert.equal(parseAbsoluteTimestamp("2024-02-29T23:59:59.123Z")?.toISOString(), "2024-02-29T23:59:59.123Z");
  assert.equal(parseAbsoluteTimestamp("2026-08-10T14:00:00+02:00")?.toISOString(), "2026-08-10T12:00:00.000Z");
  assert.equal(parseAbsoluteTimestamp("2026-08-10T02:00:00-10:00")?.toISOString(), "2026-08-10T12:00:00.000Z");
});

test("rejects missing, timezone-less, impossible calendar, clock, and offset values", () => {
  for (const value of [undefined, ["2026-08-10T00:00:00Z"], "2026-08-10T00:00:00", "2026-02-30T00:00:00Z", "2026-04-31T00:00:00Z", "2026-08-10T24:00:00Z", "2026-08-10T00:60:00Z", "2026-08-10T00:00:60Z", "2026-08-10T00:00:00+24:00", "2026-08-10T00:00:00+14:01"]) assert.equal(parseAbsoluteTimestamp(value), null);
});

test("requires a non-empty range no longer than exactly 24 hours", () => {
  const from = "2026-08-10T00:00:00Z";
  assert.equal(parseVehicleTrackRange(from, from), null);
  assert.equal(parseVehicleTrackRange("2026-08-10T00:00:00.001Z", from), null);
  assert.equal(parseVehicleTrackRange(from, "2026-08-11T00:00:00.001Z"), null);
  const exact = parseVehicleTrackRange(from, "2026-08-11T00:00:00Z");
  if (!exact) assert.fail("Expected exact 24-hour range");
  assert.equal(exact.to.getTime() - exact.from.getTime(), VEHICLE_TRACK_MAX_RANGE_MS);
  assert.ok(parseVehicleTrackRange("2030-01-01T00:00:00Z", "2030-01-01T01:00:00Z"));
});
