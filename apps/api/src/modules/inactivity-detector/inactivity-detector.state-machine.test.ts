import assert from "node:assert/strict";
import test from "node:test";
import { haversineDistanceMeters } from "./haversine-distance";
import { InactivityDetectorStateMachine } from "./inactivity-detector.state-machine";
import type { InactivityObservationInput, InactivityRuleContext } from "./inactivity-detector.types";

const MINUTE = 60_000;
const context = (overrides: Partial<InactivityRuleContext> = {}): InactivityRuleContext => ({ ruleEnabled: true, distanceThresholdMeters: 300, durationThresholdMinutes: 60, ...overrides });
const longitudeForMeters = (meters: number): number => meters / 6_371_000 * 180 / Math.PI;
const observation = (minutes: number, longitude = 0, vehicleId: unknown = "vehicle", overrides: Partial<InactivityObservationInput> = {}): InactivityObservationInput => ({ vehicleId, observedAt: new Date(Date.UTC(2026, 7, 6, 10, 0, 0) + minutes * MINUTE).toISOString(), latitude: 0, longitude, ...overrides });

function collectToDuration(detector: InactivityDetectorStateMachine, vehicleId = "vehicle", longitude = 0) {
  detector.detect(observation(0, longitude, vehicleId), context());
  detector.detect(observation(59 + 59 / 60, longitude, vehicleId), context());
  return detector.detect(observation(60, longitude, vehicleId), context());
}

test("first observation starts collection, 59:59 is incomplete, and exactly 60 minutes confirms once", () => {
  const detector = new InactivityDetectorStateMachine();
  const first = detector.detect(observation(0), context());
  assert.equal(first.status, "COLLECTING"); assert.equal(first.reason, "WINDOW_STARTED");
  const before = detector.detect(observation(59 + 59 / 60), context());
  assert.equal(before.status, "COLLECTING"); assert.equal(before.reason, "WINDOW_INCOMPLETE");
  const confirmed = detector.detect(observation(60), context());
  assert.equal(confirmed.status, "CONFIRMED"); assert.equal(confirmed.newlyConfirmed, true); assert.equal(confirmed.elapsedMinutes, 60);
  const active = detector.detect(observation(61), context());
  assert.equal(active.status, "ACTIVE"); assert.equal(active.newlyConfirmed, false);
});

test("strict distance boundary confirms below 300 and clears at and above 300", () => {
  const under = new InactivityDetectorStateMachine();
  under.detect(observation(0, 0, "under"), context());
  under.detect(observation(30, longitudeForMeters(299.99), "under"), context());
  const underResult = under.detect(observation(60, longitudeForMeters(299.99), "under"), context());
  assert.equal(underResult.status, "CONFIRMED"); assert.ok(underResult.traveledDistanceMeters! < 300);

  const atThreshold = new InactivityDetectorStateMachine();
  atThreshold.detect(observation(0, 0, "at"), context());
  atThreshold.detect(observation(30, longitudeForMeters(300), "at"), context());
  const exact = atThreshold.detect(observation(60, longitudeForMeters(300), "at"), context());
  assert.ok(exact.traveledDistanceMeters! >= 300); assert.equal(exact.status, "CLEAR");

  const over = new InactivityDetectorStateMachine();
  over.detect(observation(0, 0, "over"), context());
  over.detect(observation(30, longitudeForMeters(350), "over"), context());
  assert.equal(over.detect(observation(60, longitudeForMeters(350), "over"), context()).status, "CLEAR");
});

test("uses cumulative sequential path rather than start-to-end displacement", () => {
  const detector = new InactivityDetectorStateMachine();
  detector.detect(observation(0, 0), context());
  detector.detect(observation(20, longitudeForMeters(200)), context());
  detector.detect(observation(40, 0), context());
  const result = detector.detect(observation(60, longitudeForMeters(1)), context());
  assert.ok(result.traveledDistanceMeters! > 300); assert.equal(result.status, "CLEAR");
});

test("clips large movement mostly before the rolling cutoff instead of counting its full segment", () => {
  const detector = new InactivityDetectorStateMachine();
  detector.detect(observation(0, 0), context());
  detector.detect(observation(59, longitudeForMeters(400)), context());
  const result = detector.detect(observation(118, longitudeForMeters(400)), context());
  assert.equal(result.status, "CONFIRMED"); assert.equal(result.newlyConfirmed, true); assert.ok(result.traveledDistanceMeters! < 300);
  assert.ok(Math.abs(result.traveledDistanceMeters! - 400 / 59) < 0.001);
});

test("movement ending exactly at cutoff is excluded from the current rolling-window distance", () => {
  const detector = new InactivityDetectorStateMachine();
  detector.detect(observation(1, 0), context());
  detector.detect(observation(60, longitudeForMeters(400)), context());
  detector.detect(observation(119, longitudeForMeters(400)), context());
  const result = detector.detect(observation(120, longitudeForMeters(400)), context());
  assert.equal(result.status, "ACTIVE"); assert.equal(result.traveledDistanceMeters, 0); assert.equal(result.windowPointCount, 3);
});

test("crossing segment includes only its time-proportional fraction after cutoff", () => {
  const detector = new InactivityDetectorStateMachine();
  detector.detect(observation(0, 0), context());
  detector.detect(observation(50, longitudeForMeters(500)), context());
  const result = detector.detect(observation(108, longitudeForMeters(500)), context());
  assert.equal(result.status, "CONFIRMED"); assert.ok(Math.abs(result.traveledDistanceMeters! - 20) < 0.001);
});

test("GPS jitter below the threshold confirms inactivity", () => {
  const detector = new InactivityDetectorStateMachine();
  detector.detect(observation(0, 0), context());
  detector.detect(observation(15, longitudeForMeters(20)), context());
  detector.detect(observation(30, longitudeForMeters(-15)), context());
  detector.detect(observation(45, longitudeForMeters(10)), context());
  const result = detector.detect(observation(60, longitudeForMeters(5)), context());
  assert.ok(result.traveledDistanceMeters! < 300); assert.equal(result.status, "CONFIRMED");
});

test("after CLEAR a later immobile rolling window produces a new confirmation", () => {
  const detector = new InactivityDetectorStateMachine();
  detector.detect(observation(0, 0), context());
  detector.detect(observation(30, longitudeForMeters(400)), context());
  assert.equal(detector.detect(observation(60, longitudeForMeters(400)), context()).status, "CLEAR");
  const newEpisode = detector.detect(observation(90, longitudeForMeters(400)), context());
  assert.equal(newEpisode.status, "CONFIRMED"); assert.equal(newEpisode.newlyConfirmed, true);
  assert.equal(detector.detect(observation(120, longitudeForMeters(400)), context()).status, "ACTIVE");
});

test("vehicle histories and active episodes are isolated", () => {
  const detector = new InactivityDetectorStateMachine();
  assert.equal(collectToDuration(detector, "a").status, "CONFIRMED");
  assert.equal(collectToDuration(detector, "b").status, "CONFIRMED");
  assert.equal(detector.detect(observation(61, 0, "a"), context()).status, "ACTIVE");
  assert.equal(detector.detect(observation(61, longitudeForMeters(400), "b"), context()).status, "CLEAR");
});

test("duplicate and older timestamps are ignored without changing state", () => {
  const detector = new InactivityDetectorStateMachine();
  detector.detect(observation(0), context());
  detector.detect(observation(30), context());
  for (const input of [observation(30), observation(29)]) {
    const result = detector.detect(input, context());
    assert.equal(result.status, "IGNORED"); assert.equal(result.reason, "OUT_OF_ORDER");
  }
  assert.equal(detector.detect(observation(59 + 59 / 60), context()).status, "COLLECTING");
  assert.equal(detector.detect(observation(60), context()).status, "CONFIRMED");
});

test("invalid observations do not mutate history, timestamps, or episodes", () => {
  const detector = new InactivityDetectorStateMachine();
  detector.detect(observation(0), context());
  const invalid = [
    observation(1, 0, " "), observation(1, 0, "vehicle", { observedAt: "invalid" }), observation(1, Number.NaN),
    observation(1, 0, "vehicle", { longitude: Number.POSITIVE_INFINITY }), observation(1, 0, "vehicle", { latitude: 91 }), observation(1, 0, "vehicle", { longitude: 181 }),
  ];
  for (const input of invalid) { const result = detector.detect(input, context()); assert.equal(result.status, "IGNORED"); assert.equal(result.reason, "INVALID_OBSERVATION"); }
  assert.equal(detector.detect(observation(59 + 59 / 60), context()).status, "COLLECTING");
  assert.equal(detector.detect(observation(60), context()).status, "CONFIRMED");
});

test("a data gap at least the full duration resets the window and cannot confirm inactivity", () => {
  const detector = new InactivityDetectorStateMachine();
  detector.detect(observation(0), context());
  const gapped = detector.detect(observation(60), context());
  assert.equal(gapped.status, "COLLECTING"); assert.equal(gapped.reason, "DATA_GAP"); assert.equal(gapped.windowPointCount, 1);
});

test("disabled rule clears every vehicle state and a later enable starts a fresh window", () => {
  const detector = new InactivityDetectorStateMachine();
  detector.detect(observation(0), context());
  const disabled = detector.detect(observation(30), context({ ruleEnabled: false }));
  assert.equal(disabled.status, "IGNORED"); assert.equal(disabled.reason, "RULE_DISABLED"); assert.equal(detector.stateCount(), 0);
  const enabled = detector.detect(observation(60), context());
  assert.equal(enabled.status, "COLLECTING"); assert.equal(enabled.reason, "WINDOW_STARTED");
});

test("distance and duration setting transitions clear old history", () => {
  const detector = new InactivityDetectorStateMachine();
  detector.detect(observation(0), context());
  const distanceChanged = detector.detect(observation(10), context({ distanceThresholdMeters: 301 }));
  assert.equal(distanceChanged.status, "COLLECTING"); assert.equal(distanceChanged.reason, "RULE_CONTEXT_CHANGED");
  const durationChanged = detector.detect(observation(20), context({ distanceThresholdMeters: 301, durationThresholdMinutes: 61 }));
  assert.equal(durationChanged.status, "COLLECTING"); assert.equal(durationChanged.reason, "RULE_CONTEXT_CHANGED");
});

test("rolling cutoff bounds history and drops an unnecessary anchor at exact cutoff", () => {
  const detector = new InactivityDetectorStateMachine();
  for (const minute of [0, 30, 60, 90, 120]) detector.detect(observation(minute, longitudeForMeters(10)), context());
  const result = detector.detect(observation(150, longitudeForMeters(10)), context());
  assert.equal(result.status, "ACTIVE"); assert.equal(result.windowPointCount, 3); assert.equal(result.elapsedMinutes, 60);
});

test("resetVehicle, clearAll, and stateCount manage only in-memory state", () => {
  const detector = new InactivityDetectorStateMachine();
  detector.detect(observation(0, 0, "a"), context()); detector.detect(observation(0, 0, "b"), context());
  assert.equal(detector.stateCount(), 2); detector.resetVehicle("a"); assert.equal(detector.stateCount(), 1);
  assert.equal(detector.detect(observation(1, 0, "a"), context()).reason, "WINDOW_STARTED");
  detector.clearAll(); assert.equal(detector.stateCount(), 0);
});

test("Haversine utility returns a finite non-negative meter distance", () => {
  const from = { latitude: 0, longitude: 0 }; const to = { latitude: 0, longitude: longitudeForMeters(100) };
  const distance = haversineDistanceMeters(from, to);
  assert.ok(Number.isFinite(distance)); assert.ok(distance >= 0); assert.ok(Math.abs(distance - 100) < 0.000_001);
});

test("Haversine stays finite for valid near-antipodal coordinates", () => {
  const distance = haversineDistanceMeters({ latitude: 0, longitude: 0 }, { latitude: 0.000_001, longitude: 179.999_999 });
  assert.ok(Number.isFinite(distance)); assert.ok(distance > 10_000_000);
});
