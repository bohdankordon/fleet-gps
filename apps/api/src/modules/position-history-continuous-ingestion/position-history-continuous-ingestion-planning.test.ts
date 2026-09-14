import assert from "node:assert/strict";
import test from "node:test";
import { POSITION_HISTORY_CONTINUOUS_FAILURE_BACKOFF_MS, POSITION_HISTORY_CONTINUOUS_FINALITY_DELAY_MS, POSITION_HISTORY_CONTINUOUS_PROGRESS_QUANTUM_MS, POSITION_HISTORY_CONTINUOUS_REPLAY_OVERLAP_MS } from "./position-history-continuous-ingestion.constants";
import { contiguousBacklogRange, contiguousBacklogRanges, recentTailRange } from "./position-history-continuous-ingestion-planning";

const cursor = (coverage: string, confirmed: string) => ({ vehicleId: "123e4567-e89b-42d3-a456-426614174000", coverageFrom: new Date(coverage), confirmedThrough: new Date(confirmed), createdAt: new Date(coverage), updatedAt: new Date(confirmed) });

test("recent tail is the exact closed fifteen-minute range ending at safeNow", () => {
  const safeNow = new Date("2026-09-13T11:58:00Z");
  const range = recentTailRange(safeNow);
  assert.equal(range.fetchFrom.toISOString(), "2026-09-13T11:43:00.000Z");
  assert.equal(range.fetchTo.toISOString(), safeNow.toISOString());
  assert.equal(range.fetchTo.getTime() - range.fetchFrom.getTime(), POSITION_HISTORY_CONTINUOUS_REPLAY_OVERLAP_MS);
});

test("initial finality and outer failure policies remain explicit bounded operational constants", () => {
  assert.equal(POSITION_HISTORY_CONTINUOUS_FINALITY_DELAY_MS, 120_000);
  assert.deepEqual(POSITION_HISTORY_CONTINUOUS_FAILURE_BACKOFF_MS, [60_000, 120_000, 240_000, 480_000, 960_000, 1_800_000]);
});

test("long backlog prefers 5h45m progress while adding at most 15 minutes of fetch overlap", () => {
  const state = cursor("2026-09-01T00:00:00Z", "2026-09-01T01:00:00Z");
  const range = contiguousBacklogRange(state, new Date("2026-09-13T11:58:00Z"))!;
  assert.equal(range.expectedConfirmedThrough.toISOString(), "2026-09-01T01:00:00.000Z");
  assert.equal(range.nextConfirmedThrough.getTime() - range.expectedConfirmedThrough.getTime(), POSITION_HISTORY_CONTINUOUS_PROGRESS_QUANTUM_MS);
  assert.equal(range.fetchFrom.toISOString(), "2026-09-01T00:45:00.000Z");
  assert.equal(range.expectedCoverageFrom.toISOString(), state.coverageFrom.toISOString());
  assert.equal(range.fetchTo.getTime() - range.fetchFrom.getTime(), 6 * 60 * 60 * 1_000);
});

test("dense backlog fallback keeps the same CAS boundary and offers 6h, 3h, then 1h fetches", () => {
  const state = cursor("2026-09-01T00:00:00Z", "2026-09-01T01:00:00Z");
  const ranges = contiguousBacklogRanges(state, new Date("2026-09-13T11:58:00Z"));
  assert.deepEqual(ranges.map((range) => ({ fetchHours: (range.fetchTo.getTime() - range.fetchFrom.getTime()) / 3_600_000, progressMinutes: (range.nextConfirmedThrough.getTime() - range.expectedConfirmedThrough.getTime()) / 60_000 })), [
    { fetchHours: 6, progressMinutes: 345 },
    { fetchHours: 3, progressMinutes: 165 },
    { fetchHours: 1, progressMinutes: 45 },
  ]);
  assert.ok(ranges.every((range) => range.expectedCoverageFrom.getTime() === state.coverageFrom.getTime()));
  assert.ok(ranges.every((range) => range.expectedConfirmedThrough.getTime() === state.confirmedThrough.getTime()));
});

test("initial floor never fetches before coverageFrom and caught-up progress is bounded by safeNow", () => {
  const initial = contiguousBacklogRange(cursor("2026-09-01T00:00:00Z", "2026-09-01T00:00:00Z"), new Date("2026-09-13T11:58:00Z"))!;
  assert.equal(initial.fetchFrom.toISOString(), "2026-09-01T00:00:00.000Z");
  assert.equal(initial.fetchTo.toISOString(), "2026-09-01T05:45:00.000Z");
  const near = contiguousBacklogRange(cursor("2026-09-01T00:00:00Z", "2026-09-13T11:50:00Z"), new Date("2026-09-13T11:58:00Z"))!;
  assert.equal(near.nextConfirmedThrough.toISOString(), "2026-09-13T11:58:00.000Z");
  assert.equal(contiguousBacklogRange(cursor("2026-09-01T00:00:00Z", "2026-09-13T11:58:00Z"), new Date("2026-09-13T11:58:00Z")), null);
});
