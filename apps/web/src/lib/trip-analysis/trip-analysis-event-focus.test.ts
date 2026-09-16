import assert from "node:assert/strict";
import test from "node:test";
import { tripAnalysisFixture } from "./trip-analysis-fixture";
import { parseTripEventId, resolveContainingTrip, TRIP_EVENT_FOCUS_ZOOM, tripEventFocusCamera } from "./trip-analysis-event-focus";

const EVENT_ID = "00000000-0000-4000-8000-000000000099";

test("event UUID syntax is optional and invalid syntax is ignored safely", () => {
  assert.equal(parseTripEventId(EVENT_ID.toUpperCase()), EVENT_ID);
  for (const value of [undefined, "not-a-uuid", [EVENT_ID]]) assert.equal(parseTripEventId(value), null);
});

test("containing-trip resolution is inclusive and only accepts exactly one TRIP", () => {
  const data = tripAnalysisFixture();
  for (const instant of [data.trips[0]!.startAt, "2026-08-01T00:00:30.000Z", data.trips[0]!.endAt]) assert.deepEqual(resolveContainingTrip(data, instant), { kind: "MATCH", tripKey: "trip-0" });
  assert.deepEqual(resolveContainingTrip(data, "2026-08-01T00:06:00.000Z"), { kind: "NO_MATCH" }, "stop must not be selected");
  assert.deepEqual(resolveContainingTrip(data, "2026-08-01T00:15:00.000Z"), { kind: "NO_MATCH" }, "gap must not be selected");
  assert.deepEqual(resolveContainingTrip(data, "2026-08-01T11:00:00.000Z"), { kind: "NO_MATCH" });
  const overlap = { ...data, trips: [...data.trips, { ...data.trips[0]! }], summary: { ...data.summary, tripCount: 2 } };
  assert.deepEqual(resolveContainingTrip(overlap, "2026-08-01T00:00:30.000Z"), { kind: "AMBIGUOUS" });
  assert.deepEqual(resolveContainingTrip(null, data.trips[0]!.startAt), { kind: "NO_MATCH" });
});

test("event camera is bounded at useful road zoom and centers the persisted anchor", () => {
  assert.ok(TRIP_EVENT_FOCUS_ZOOM >= 14 && TRIP_EVENT_FOCUS_ZOOM <= 16);
  assert.deepEqual(tripEventFocusCamera({ latitude: 49.23, longitude: 28.48 }), { center: [28.48, 49.23], zoom: TRIP_EVENT_FOCUS_ZOOM });
});
