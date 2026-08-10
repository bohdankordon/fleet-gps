import assert from "node:assert/strict";
import test from "node:test";
import { trackFixture } from "./vehicle-track-fixture";
import { abortVehicleTrackRequest, beginVehicleTrackRequest, failVehicleTrackRequest, initialVehicleTrackRequestState, succeedVehicleTrackRequest } from "./vehicle-track-request-state";
const range = trackFixture().range;
test("request state prevents overlap, preserves last-good on failure/422, clears error and ignores stale generations", () => {
  const initial = initialVehicleTrackRequestState(trackFixture(), range, null); const first = beginVehicleTrackRequest(initial, range, false); assert.equal(beginVehicleTrackRequest(first, range, false), first);
  const failed = failVehicleTrackRequest(first, first.generation, "UNAVAILABLE"); assert.equal(failed.data, initial.data); assert.equal(failed.error, "UNAVAILABLE");
  const second = beginVehicleTrackRequest(failed, range, false); const dense = failVehicleTrackRequest(second, second.generation, "TOO_DENSE"); assert.equal(dense.data, initial.data);
  const third = beginVehicleTrackRequest(dense, range, false); assert.equal(succeedVehicleTrackRequest(third, third.generation - 1, trackFixture()), third); const success = succeedVehicleTrackRequest(third, third.generation, trackFixture()); assert.equal(success.error, null); assert.equal(success.loading, false);
  assert.equal(abortVehicleTrackRequest(beginVehicleTrackRequest(success, range, false), success.generation + 1).loading, false);
});
