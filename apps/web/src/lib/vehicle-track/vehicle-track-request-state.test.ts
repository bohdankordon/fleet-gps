import assert from "node:assert/strict";
import test from "node:test";
import { overviewSegment, overviewTrackFixture, trackFixture, trackPoint } from "./vehicle-track-fixture";
import type { VehicleTrackLoadedData } from "./vehicle-track-load";
import { parseVehicleTrackCustomRange } from "./vehicle-track-custom-range";
import { abortVehicleTrackRequest, beginVehicleTrackRequest, failVehicleTrackRequest, initialVehicleTrackRequestState, succeedVehicleTrackRequest } from "./vehicle-track-request-state";

const exact: VehicleTrackLoadedData = { mode: "EXACT", response: trackFixture([trackPoint()]) };
const overview: VehicleTrackLoadedData = { mode: "OVERVIEW", response: overviewTrackFixture([overviewSegment([trackPoint("2026-08-01T00:00:00Z")], 20)]) };
const exactRange = exact.response.range; const overviewRange = overview.response.range;

test("one request state transitions exact to overview and overview to exact", () => {
  const initialExact = initialVehicleTrackRequestState(exact, exactRange, null);
  const loadingOverview = beginVehicleTrackRequest(initialExact, overviewRange, true);
  assert.equal(beginVehicleTrackRequest(loadingOverview, overviewRange, true), loadingOverview);
  assert.equal(loadingOverview.data, exact); assert.equal(loadingOverview.range, exactRange); assert.equal(loadingOverview.pendingRange, overviewRange);
  const shownOverview = succeedVehicleTrackRequest(loadingOverview, loadingOverview.generation, overview);
  assert.equal(shownOverview.data?.mode, "OVERVIEW"); assert.equal(shownOverview.range, overviewRange); assert.equal(shownOverview.pendingRange, null);
  const loadingExact = beginVehicleTrackRequest(shownOverview, exactRange, true);
  const shownExact = succeedVehicleTrackRequest(loadingExact, loadingExact.generation, exact);
  assert.equal(shownExact.data?.mode, "EXACT"); assert.equal(shownExact.range, exactRange);
});

test("overview failure preserves exact last-good and exact failure preserves overview last-good", () => {
  const exactState = initialVehicleTrackRequestState(exact, exactRange, null);
  const overviewLoad = beginVehicleTrackRequest(exactState, overviewRange, true);
  const overviewFailed = failVehicleTrackRequest(overviewLoad, overviewLoad.generation, "TOO_FRAGMENTED_OVERVIEW");
  assert.equal(overviewFailed.data, exact); assert.equal(overviewFailed.range, exactRange); assert.equal(overviewFailed.pendingRange, null);

  const overviewState = initialVehicleTrackRequestState(overview, overviewRange, null);
  const exactLoad = beginVehicleTrackRequest(overviewState, exactRange, true);
  const exactFailed = failVehicleTrackRequest(exactLoad, exactLoad.generation, "TOO_DENSE_EXACT");
  assert.equal(exactFailed.data, overview); assert.equal(exactFailed.range, overviewRange); assert.equal(exactFailed.pendingRange, null);
});

test("same-range refresh preserves loaded range, ignores stale generations, and abort clears overlap", () => {
  const initial = initialVehicleTrackRequestState(overview, overviewRange, null);
  const refresh = beginVehicleTrackRequest(initial, overviewRange, false);
  assert.equal(refresh.rangeChanged, false); assert.equal(refresh.range, overviewRange);
  assert.equal(succeedVehicleTrackRequest(refresh, refresh.generation - 1, overview), refresh);
  const success = succeedVehicleTrackRequest(refresh, refresh.generation, overview);
  assert.equal(success.error, null); assert.equal(success.loading, false);
  const next = beginVehicleTrackRequest(success, overviewRange, false);
  assert.equal(abortVehicleTrackRequest(next, next.generation).loading, false);
});

test("a dirty custom draft cannot change the range used by manual refresh", () => {
  const initial = initialVehicleTrackRequestState(exact, exactRange, null);
  const dirtyDraft = parseVehicleTrackCustomRange({ from: "2026-08-07T12:00", to: "2026-08-09T12:00" });
  assert.ok(dirtyDraft.range);
  assert.notDeepEqual(dirtyDraft.range, initial.range);

  const refresh = beginVehicleTrackRequest(initial, initial.range!, false);
  assert.deepEqual(refresh.pendingRange, exactRange);
  assert.deepEqual(refresh.range, exactRange);
  assert.equal(refresh.rangeChanged, false);
});
