import assert from "node:assert/strict";
import test from "node:test";
import { canonicalPositionHistoryMaintenanceAnchor, POSITION_HISTORY_MAINTENANCE_ANCHOR_INTERVAL_MS } from "./position-history-maintenance-anchor";

const canonical = (instant: string): string => canonicalPositionHistoryMaintenanceAnchor(new Date(instant)).toISOString();

test("canonical anchor is the latest occurred Tuesday 02:00:00.000 UTC boundary", () => {
  const cases = [
    ["2026-08-11T01:59:59.999Z", "2026-08-04T02:00:00.000Z"],
    ["2026-08-11T02:00:00.000Z", "2026-08-11T02:00:00.000Z"],
    ["2026-08-11T18:42:11.777Z", "2026-08-11T02:00:00.000Z"],
    ["2026-08-12T10:00:00.000Z", "2026-08-11T02:00:00.000Z"],
    ["2026-08-17T23:59:59.999Z", "2026-08-11T02:00:00.000Z"],
    ["2026-08-18T01:59:59.999Z", "2026-08-11T02:00:00.000Z"],
    ["2026-08-18T02:00:00.000Z", "2026-08-18T02:00:00.000Z"],
    ["2026-08-13T10:00:00.000Z", "2026-08-11T02:00:00.000Z"],
  ] as const;
  for (const [instant, expected] of cases) assert.equal(canonical(instant), expected, instant);
});

test("canonical anchors move in exact seven-day UTC increments with normalized milliseconds", () => {
  const first = canonicalPositionHistoryMaintenanceAnchor(new Date("2026-08-11T02:00:00.999Z"));
  const second = canonicalPositionHistoryMaintenanceAnchor(new Date("2026-08-18T02:00:00.001Z"));
  assert.equal(second.getTime() - first.getTime(), POSITION_HISTORY_MAINTENANCE_ANCHOR_INTERVAL_MS);
  assert.equal(POSITION_HISTORY_MAINTENANCE_ANCHOR_INTERVAL_MS, 7 * 24 * 60 * 60 * 1_000);
  assert.match(first.toISOString(), /T02:00:00\.000Z$/);
  assert.match(second.toISOString(), /T02:00:00\.000Z$/);
});

test("UTC anchor calculation is independent of local timezone and DST boundaries", () => {
  const original = process.env.TZ;
  try {
    for (const timezone of ["UTC", "Europe/Kyiv", "America/New_York", "Pacific/Auckland"]) {
      process.env.TZ = timezone;
      assert.equal(canonical("2026-03-29T03:30:00.123Z"), "2026-03-24T02:00:00.000Z");
      assert.equal(canonical("2026-11-01T03:30:00.987Z"), "2026-10-27T02:00:00.000Z");
    }
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});

test("invalid instants are rejected", () => {
  assert.throws(() => canonicalPositionHistoryMaintenanceAnchor(new Date(Number.NaN)), /Invalid position-history maintenance instant/);
});
