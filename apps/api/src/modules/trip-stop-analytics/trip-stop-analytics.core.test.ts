import assert from "node:assert/strict";
import test from "node:test";
import { calculateObservedDistanceMeters, analyzeTripStopObservations } from "./trip-stop-analytics.core";
import type { TripStopAnalyticsObservation } from "./trip-stop-analytics.types";
import { DEFAULT_TRIP_STOP_ANALYTICS_POLICY } from "./trip-stop-analytics.constants";

const origin = new Date("2026-08-01T00:00:00.000Z");

function at(second: number, speedKph: number | null, options: Partial<Omit<TripStopAnalyticsObservation, "observedAt" | "speedKph">> = {}): TripStopAnalyticsObservation {
  return {
    observedAt: new Date(origin.getTime() + second * 1_000),
    fixFingerprint: second.toString().padStart(8, "0"),
    latitude: 0,
    longitude: second / 10_000,
    speedKph,
    valid: true,
    outdated: false,
    ...options,
  };
}

function analyze(observations: readonly TripStopAnalyticsObservation[], toSecond = 1_000, policy = DEFAULT_TRIP_STOP_ANALYTICS_POLICY) {
  return analyzeTripStopObservations(observations, { from: origin, to: new Date(origin.getTime() + toSecond * 1_000) }, policy);
}

test("current global policy changes derived historical analytics without changing the observation fixture", () => {
  const observations = [at(0, 6), at(60, 6)];
  const defaultResult = analyze(observations, 120);
  const higherThreshold = analyze(observations, 120, { ...DEFAULT_TRIP_STOP_ANALYTICS_POLICY, tripMovementSpeedKph: 7 });
  assert.equal(defaultResult.trips.length, 1); assert.equal(higherThreshold.trips.length, 0);
  assert.equal(observations[0]?.speedKph, 6); assert.equal(observations[1]?.speedKph, 6);
});

test("policy confirmation and continuity thresholds alter the same evidence deterministically", () => {
  const movement = [at(0, 10), at(60, 10)];
  assert.equal(analyze(movement, 120, { ...DEFAULT_TRIP_STOP_ANALYTICS_POLICY, tripMovementConfirmationSeconds: 60 }).trips.length, 1);
  assert.equal(analyze(movement, 120, { ...DEFAULT_TRIP_STOP_ANALYTICS_POLICY, tripMovementConfirmationSeconds: 61 }).trips.length, 0);
  const stopped = [at(0, 0), at(120, 0)];
  assert.equal(analyze(stopped, 200, { ...DEFAULT_TRIP_STOP_ANALYTICS_POLICY, tripStopConfirmationSeconds: 120 }).stops.length, 1);
  assert.equal(analyze(stopped, 200, { ...DEFAULT_TRIP_STOP_ANALYTICS_POLICY, tripStopConfirmationSeconds: 121 }).stops.length, 0);
  const gapped = [at(0, 10), at(60, 10), at(180, 10)];
  assert.equal(analyze(gapped, 240, { ...DEFAULT_TRIP_STOP_ANALYTICS_POLICY, tripDataGapSeconds: 120 }).gaps.length, 0);
  assert.equal(analyze(gapped, 240, { ...DEFAULT_TRIP_STOP_ANALYTICS_POLICY, tripDataGapSeconds: 119 }).gaps.length, 1);
});

test("isolated movement evidence and 59 seconds do not confirm a trip", () => {
  assert.equal(analyze([at(0, 5)]).trips.length, 0);
  assert.equal(analyze([at(0, 5), at(59, 20)]).trips.length, 0);
});

test("consecutive movement evidence spanning exactly 60 seconds confirms and backdates the trip", () => {
  const result = analyze([at(0, 5), at(30, 7), at(60, 6)], 120);
  assert.equal(result.trips.length, 1);
  assert.equal(result.trips[0]?.startAt.toISOString(), origin.toISOString());
  assert.equal(result.trips[0]?.terminationReason, "RANGE_END");
  assert.equal(result.trips[0]?.durationSeconds, 60);
  assert.equal(result.trips[0]?.observationCount, 3);
});

test("stopped or unknown evidence cancels an unconfirmed movement candidate", () => {
  assert.equal(analyze([at(0, 10), at(30, 0), at(60, 10)]).trips.length, 0);
  assert.equal(analyze([at(0, 10), at(30, null), at(60, 10)]).trips.length, 0);
});

test("exactly five minutes of stopped evidence confirms a standalone stop and backdates it", () => {
  const result = analyze([at(0, 0), at(100, 4.9), at(300, 0)], 400);
  assert.equal(result.stops.length, 1);
  assert.equal(result.stops[0]?.startAt.toISOString(), origin.toISOString());
  assert.equal(result.stops[0]?.durationSeconds, 300);
  assert.equal(result.stops[0]?.startsAtRangeBoundary, true);
  assert.equal(result.stops[0]?.endsAtRangeBoundary, true);
});

test("four minutes 59 seconds of stopped evidence does not confirm a stop", () => {
  assert.equal(analyze([at(0, 0), at(299, 0)], 299).stops.length, 0);
});

test("a short below-threshold pause remains inside one active trip", () => {
  const result = analyze([at(0, 10), at(60, 10), at(100, 0), at(399, 0), at(400, 10)], 500);
  assert.equal(result.trips.length, 1);
  assert.equal(result.stops.length, 0);
  assert.equal(result.trips[0]?.startAt.toISOString(), origin.toISOString());
  assert.equal(result.trips[0]?.endAt.toISOString(), new Date(origin.getTime() + 400_000).toISOString());
  assert.equal(result.trips[0]?.observationCount, 5);
});

test("a confirmed stop ends the trip at the first stopped observation", () => {
  const result = analyze([at(0, 10), at(60, 10), at(100, 0), at(250, 0), at(400, 0)], 500);
  assert.equal(result.trips[0]?.terminationReason, "STOP");
  assert.equal(result.trips[0]?.endAt.toISOString(), new Date(origin.getTime() + 100_000).toISOString());
  assert.equal(result.trips[0]?.observationCount, 3);
  assert.equal(result.stops[0]?.startAt.toISOString(), new Date(origin.getTime() + 100_000).toISOString());
});

test("movement after a confirmed stop needs 60 seconds and backdates both boundaries", () => {
  const beforeConfirmation = analyze([at(0, 10), at(60, 10), at(100, 0), at(400, 0), at(500, 10), at(559, 10)], 600);
  assert.equal(beforeConfirmation.trips.length, 1);
  assert.equal(beforeConfirmation.stops[0]?.terminationReason, "RANGE_END");
  const confirmed = analyze([at(0, 10), at(60, 10), at(100, 0), at(400, 0), at(500, 10), at(560, 10)], 600);
  assert.equal(confirmed.trips.length, 2);
  assert.equal(confirmed.stops[0]?.terminationReason, "MOVEMENT");
  assert.equal(confirmed.stops[0]?.endAt.toISOString(), new Date(origin.getTime() + 500_000).toISOString());
  assert.equal(confirmed.trips[1]?.startAt.toISOString(), new Date(origin.getTime() + 500_000).toISOString());
});

test("a raw adjacent gap of exactly 300 seconds is continuous", () => {
  const result = analyze([at(0, 10), at(60, 10), at(360, 10)], 400);
  assert.equal(result.gaps.length, 0);
  assert.equal(result.continuitySegmentCount, 1);
  assert.equal(result.trips.length, 1);
});

test("a raw adjacent gap over 300 seconds is separately emitted and ends an active trip", () => {
  const result = analyze([at(0, 10), at(60, 10), at(361, 10)], 500);
  assert.deepEqual(result.gaps.map((gap) => gap.durationSeconds), [301]);
  assert.equal(result.continuitySegmentCount, 2);
  assert.equal(result.trips.length, 1);
  assert.equal(result.trips[0]?.terminationReason, "DATA_GAP");
  assert.equal(result.trips[0]?.endAt.toISOString(), new Date(origin.getTime() + 60_000).toISOString());
});

test("a data gap ends an active stop without classifying the gap as stopping", () => {
  const result = analyze([at(0, 0), at(300, 0), at(601, 0)], 700);
  assert.equal(result.stops.length, 1);
  assert.equal(result.stops[0]?.terminationReason, "DATA_GAP");
  assert.equal(result.stops[0]?.durationSeconds, 300);
  assert.deepEqual(result.gaps.map((gap) => gap.durationSeconds), [301]);
});

test("unconfirmed movement state does not leak across a gap", () => {
  const result = analyze([at(0, 10), at(301, 10), at(360, 10)], 400);
  assert.equal(result.gaps.length, 1);
  assert.equal(result.trips.length, 0);
});

test("gap duration is never used to prove a standalone stop", () => {
  const result = analyze([at(0, 0), at(301, 0), at(600, 0)], 700);
  assert.equal(result.gaps.length, 1);
  assert.equal(result.stops.length, 0);
});

test("null speed proves neither movement nor a stop", () => {
  assert.equal(analyze([at(0, null), at(60, null)]).trips.length, 0);
  assert.equal(analyze([at(0, null), at(300, null)]).stops.length, 0);
});

test("null speed resets a stop candidate so unknown time is not counted", () => {
  const result = analyze([at(0, 0), at(100, null), at(300, 0), at(600, 0)], 700);
  assert.equal(result.stops.length, 1);
  assert.equal(result.stops[0]?.startAt.toISOString(), new Date(origin.getTime() + 300_000).toISOString());
});

test("null speed alone neither terminates an active trip nor an active stop", () => {
  const trip = analyze([at(0, 10), at(60, 10), at(100, null)], 200);
  assert.equal(trip.trips[0]?.terminationReason, "RANGE_END");
  const stop = analyze([at(0, 0), at(300, 0), at(350, null)], 400);
  assert.equal(stop.stops[0]?.terminationReason, "RANGE_END");
});

test("stationary jitter and coordinate displacement do not create movement without provider speed", () => {
  const jitter = analyze([at(0, 0, { latitude: 49, longitude: 28 }), at(60, 0, { latitude: 49.001, longitude: 28.001 })]);
  const unknown = analyze([at(0, null, { latitude: 49, longitude: 28 }), at(60, null, { latitude: 50, longitude: 29 })]);
  assert.equal(jitter.trips.length, 0);
  assert.equal(unknown.trips.length, 0);
});

test("Haversine distance is deterministic for a known equatorial fixture", () => {
  const distance = calculateObservedDistanceMeters({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 });
  assert.ok(Math.abs(distance - 111_194.92664455874) < 0.000001);
  const result = analyze([at(0, 10, { longitude: 0 }), at(60, 10, { longitude: 1 })], 60);
  assert.ok(Math.abs((result.trips[0]?.observedDistanceMeters ?? 0) - distance) < 0.000001);
});

test("observed distance is not connected across a data gap", () => {
  const result = analyze([
    at(0, 10, { longitude: 0 }), at(60, 10, { longitude: 0.01 }),
    at(361, 10, { longitude: 10 }), at(421, 10, { longitude: 10.01 }),
  ], 500);
  const oneLeg = calculateObservedDistanceMeters({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 0.01 });
  assert.equal(result.trips.length, 2);
  assert.ok(Math.abs(result.totalObservedTripDistanceMeters - oneLeg * 2) < 0.000001);
});

test("same-timestamp distinct fixes are preserved, ordered by fingerprint, and their edge has zero distance", () => {
  const first = at(0, 10, { fixFingerprint: "b", longitude: 1 });
  const second = at(0, 10, { fixFingerprint: "a", longitude: 0 });
  const final = at(60, 10, { fixFingerprint: "c", longitude: 2 });
  const result = analyze([first, final, second], 60);
  const expected = calculateObservedDistanceMeters({ latitude: 0, longitude: 1 }, { latitude: 0, longitude: 2 });
  assert.equal(result.rawObservationCount, 3);
  assert.equal(result.trips[0]?.observationCount, 3);
  assert.ok(Math.abs((result.trips[0]?.observedDistanceMeters ?? 0) - expected) < 0.000001);
});

test("same-timestamp movement points cannot satisfy elapsed movement confirmation", () => {
  assert.equal(analyze([at(0, 10, { fixFingerprint: "a" }), at(0, 10, { fixFingerprint: "b" })], 60).trips.length, 0);
});

test("valid=false and outdated=true observations remain analytical inputs", () => {
  const result = analyze([at(0, 10, { valid: false }), at(60, 10, { outdated: true })], 100);
  assert.equal(result.rawObservationCount, 2);
  assert.equal(result.trips.length, 1);
});

test("RANGE_END uses the final observed trip fix rather than fabricating an unobserved tail", () => {
  const trip = analyze([at(0, 10), at(60, 10)], 600).trips[0];
  assert.equal(trip?.terminationReason, "RANGE_END");
  assert.equal(trip?.endAt.toISOString(), new Date(origin.getTime() + 60_000).toISOString());
  assert.equal(trip?.endPosition.observedAt.toISOString(), new Date(origin.getTime() + 60_000).toISOString());
  assert.equal(trip?.durationSeconds, 60);
  assert.equal(trip?.endsAtRangeBoundary, true);
});

test("RANGE_END uses the final observed stop fix rather than fabricating an unobserved tail", () => {
  const stop = analyze([at(0, 0), at(300, 0), at(350, 0)], 600).stops[0];
  assert.equal(stop?.terminationReason, "RANGE_END");
  assert.equal(stop?.endAt.toISOString(), new Date(origin.getTime() + 350_000).toISOString());
  assert.equal(stop?.endPosition.observedAt.toISOString(), new Date(origin.getTime() + 350_000).toISOString());
  assert.equal(stop?.durationSeconds, 350);
  assert.equal(stop?.endsAtRangeBoundary, true);
});

test("RANGE_END naturally equals requested range end when the final observation is at that boundary", () => {
  const trip = analyze([at(0, 10), at(60, 10), at(300, 10), at(600, 10)], 600).trips[0];
  assert.equal(trip?.endAt.toISOString(), new Date(origin.getTime() + 600_000).toISOString());
  assert.equal(trip?.endPosition.observedAt.toISOString(), new Date(origin.getTime() + 600_000).toISOString());
  assert.equal(trip?.durationSeconds, 600);
  assert.equal(trip?.endsAtRangeBoundary, true);
});

test("empty input returns a successful empty core summary", () => {
  const result = analyze([]);
  assert.deepEqual({ raw: result.rawObservationCount, segments: result.continuitySegmentCount, trips: result.trips.length, stops: result.stops.length, gaps: result.gaps.length, first: result.firstObservationAt, last: result.lastObservationAt }, { raw: 0, segments: 0, trips: 0, stops: 0, gaps: 0, first: null, last: null });
  assert.equal(result.totalObservedTripDistanceMeters, 0);
});

test("observations outside the inclusive requested range are not analyzed", () => {
  const result = analyze([at(-1, 10), at(0, 10), at(60, 10), at(1_001, 10)]);
  assert.equal(result.rawObservationCount, 2);
  assert.equal(result.trips.length, 1);
});
