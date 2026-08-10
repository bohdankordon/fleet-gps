import assert from "node:assert/strict";
import test from "node:test";
import { createVehicleTrackPresetRange, parseExactVehicleTrackRange, parseVehicleTrackRange, parseVehicleTrackTimestamp, resolveInitialVehicleTrackRange, vehicleTrackModeForRange } from "./vehicle-track-range";

test("strict absolute range accepts offsets, leap dates, exact seven days and future instants", () => {
  assert.equal(parseVehicleTrackTimestamp("2024-02-29T12:00:00+02:00")?.toISOString(), "2024-02-29T10:00:00.000Z");
  assert.deepEqual(parseVehicleTrackRange("2030-01-01T02:00:00+02:00", "2030-01-02T00:00:00Z"), { from: "2030-01-01T00:00:00.000Z", to: "2030-01-02T00:00:00.000Z" });
  assert.ok(parseVehicleTrackRange("2030-01-01T00:00:00Z", "2030-01-08T00:00:00Z"));
});
test("strict range rejects missing pairs, invalid calendar/clock/offset, empty, reverse, and over seven days", () => {
  for (const [from, to] of [[undefined, "2026-08-10T01:00:00Z"], ["2026-08-10T00:00:00Z", undefined], ["2026-02-30T00:00:00Z", "2026-08-10T01:00:00Z"], ["2026-04-31T00:00:00Z", "2026-08-10T01:00:00Z"], ["2026-08-10T24:00:00Z", "2026-08-11T01:00:00Z"], ["2026-08-10T00:00:00+14:01", "2026-08-10T01:00:00Z"], ["2026-08-10T00:00:00", "2026-08-10T01:00:00Z"], ["2026-08-10T01:00:00Z", "2026-08-10T01:00:00Z"], ["2026-08-10T02:00:00Z", "2026-08-10T01:00:00Z"], ["2026-08-10T00:00:00Z", "2026-08-17T00:00:00.001Z"]]) assert.equal(parseVehicleTrackRange(from, to), null);
});
test("routes by absolute elapsed time at exact 24-hour and seven-day boundaries", () => {
  const cases = [
    ["2026-08-01T00:00:00Z", "2026-08-01T23:59:59Z", "EXACT"],
    ["2026-08-01T00:00:00Z", "2026-08-02T00:00:00Z", "EXACT"],
    ["2026-08-01T00:00:00Z", "2026-08-02T00:00:00.001Z", "OVERVIEW"],
    ["2026-08-01T00:00:00Z", "2026-08-04T00:00:00Z", "OVERVIEW"],
    ["2026-08-01T00:00:00Z", "2026-08-08T00:00:00Z", "OVERVIEW"],
  ] as const;
  for (const [from, to, expected] of cases) { const range = parseVehicleTrackRange(from, to); assert.ok(range); assert.equal(vehicleTrackModeForRange(range), expected); }
  assert.equal(parseVehicleTrackRange("2026-08-01T00:00:00Z", "2026-08-08T00:00:00.001Z"), null);
  assert.equal(parseExactVehicleTrackRange("2026-08-01T00:00:00Z", "2026-08-02T00:00:00Z") !== null, true);
  assert.equal(parseExactVehicleTrackRange("2026-08-01T00:00:00Z", "2026-08-02T00:00:00.001Z"), null);
});
test("default resolves one six-hour server-clock range while partial query stays invalid", () => {
  const now = new Date("2026-08-10T12:00:00Z");
  assert.deepEqual(resolveInitialVehicleTrackRange({}, now), { range: { from: "2026-08-10T06:00:00.000Z", to: "2026-08-10T12:00:00.000Z" }, defaulted: true });
  assert.deepEqual(resolveInitialVehicleTrackRange({ from: "2026-08-10T00:00:00Z" }, now), { range: null, defaulted: false });
  assert.equal(createVehicleTrackPresetRange(1, now)?.from, "2026-08-10T11:00:00.000Z");
  assert.equal(vehicleTrackModeForRange(createVehicleTrackPresetRange(24, now)!), "EXACT");
  assert.equal(vehicleTrackModeForRange(createVehicleTrackPresetRange(72, now)!), "OVERVIEW");
  assert.equal(vehicleTrackModeForRange(createVehicleTrackPresetRange(168, now)!), "OVERVIEW");
});
