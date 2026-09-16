import assert from "node:assert/strict";
import test from "node:test";
import { SpeedingDetectorStateMachine } from "./speeding-detector.state-machine";
import type { SpeedingObservationInput, SpeedingRuleContext } from "./speeding-detector.types";

const city = (overrides: Partial<SpeedingRuleContext> = {}): SpeedingRuleContext => ({ ruleEnabled: true, zone: "CITY", thresholdKph: 60, confirmationRequired: 2, settingsFingerprint: "settings-a", ...overrides });
const outside = (overrides: Partial<SpeedingRuleContext> = {}): SpeedingRuleContext => ({ ruleEnabled: true, zone: "OUTSIDE_CITY", thresholdKph: 100, confirmationRequired: 2, settingsFingerprint: "settings-a", ...overrides });
const unknown = (): SpeedingRuleContext => ({ ruleEnabled: true, zone: "UNKNOWN", thresholdKph: null, confirmationRequired: 2, settingsFingerprint: "settings-a" });
const observation = (second: number, speedKph: unknown, vehicleId: unknown = "vehicle-a", overrides: Partial<SpeedingObservationInput> = {}): SpeedingObservationInput => ({ vehicleId, observedAt: `2026-08-06T10:00:${String(second).padStart(2, "0")}.000Z`, speedKph, latitude: 49.23, longitude: 28.48, ...overrides });

test("CITY uses a strict threshold and confirms exactly once", () => {
  const detector = new SpeedingDetectorStateMachine();
  assert.deepEqual(detector.detect(observation(1, 60), city()), { vehicleId: "vehicle-a", observedAt: "2026-08-06T10:00:01.000Z", status: "CLEAR", reason: "BELOW_OR_EQUAL_THRESHOLD", zone: "CITY", speedKph: 60, thresholdKph: 60, consecutiveCount: 0, confirmationRequired: 2, newlyConfirmed: false });
  const pending = detector.detect(observation(2, 60.1), city());
  assert.equal(pending.status, "PENDING"); assert.equal(pending.consecutiveCount, 1); assert.equal(pending.newlyConfirmed, false);
  const confirmed = detector.detect(observation(3, 61), city());
  assert.equal(confirmed.status, "CONFIRMED"); assert.equal(confirmed.consecutiveCount, 2); assert.equal(confirmed.newlyConfirmed, true);
  assert.deepEqual(confirmed.confirmationPosition, { latitude: 49.23, longitude: 28.48 });
  assert.deepEqual(confirmed.streakStart, { observedAt: "2026-08-06T10:00:02.000Z", latitude: 49.23, longitude: 28.48 });
  assert.equal(confirmed.confirmationObservedAt, "2026-08-06T10:00:03.000Z");
  assert.deepEqual(confirmed.speedingPosition, { latitude: 49.23, longitude: 28.48 });
  const active = detector.detect(observation(4, 62), city());
  assert.equal(active.status, "ACTIVE"); assert.equal(active.consecutiveCount, 3); assert.equal(active.newlyConfirmed, false);
  assert.equal(active.confirmationPosition, undefined);
  assert.equal(active.confirmationObservedAt, confirmed.observedAt);
  assert.deepEqual(active.speedingPosition, { latitude: 49.23, longitude: 28.48 });
});

test("OUTSIDE_CITY has its independent strict threshold", () => {
  const detector = new SpeedingDetectorStateMachine();
  assert.equal(detector.detect(observation(1, 100), outside()).status, "CLEAR");
  assert.equal(detector.detect(observation(2, 101), outside()).status, "PENDING");
  assert.equal(detector.detect(observation(3, 101), outside()).status, "CONFIRMED");
});

test("unknown zones reset a pending episode and a later city exceed starts pending again", () => {
  const detector = new SpeedingDetectorStateMachine();
  assert.equal(detector.detect(observation(1, 61), city()).status, "PENDING");
  const ignored = detector.detect(observation(2, 200), unknown());
  assert.equal(ignored.status, "IGNORED"); assert.equal(ignored.reason, "UNKNOWN_ZONE"); assert.equal(ignored.consecutiveCount, 0); assert.equal(ignored.newlyConfirmed, false);
  const afterUnknown = detector.detect(observation(3, 61), city());
  assert.equal(afterUnknown.status, "PENDING"); assert.equal(afterUnknown.consecutiveCount, 1); assert.equal(afterUnknown.newlyConfirmed, false);
});

test("unknown zones reset an active episode", () => {
  const detector = new SpeedingDetectorStateMachine();
  assert.equal(detector.detect(observation(1, 61), city()).status, "PENDING");
  assert.equal(detector.detect(observation(2, 61), city()).status, "CONFIRMED");
  assert.equal(detector.detect(observation(3, 61), city()).status, "ACTIVE");
  assert.equal(detector.detect(observation(4, 200), unknown()).consecutiveCount, 0);
  const afterUnknown = detector.detect(observation(5, 61), city());
  assert.equal(afterUnknown.status, "PENDING"); assert.equal(afterUnknown.consecutiveCount, 1);
});

test("unknown-zone timestamps are accepted for later ordering", () => {
  const detector = new SpeedingDetectorStateMachine();
  assert.equal(detector.detect(observation(2, 200), unknown()).status, "IGNORED");
  for (const input of [observation(2, 61), observation(1, 61)]) {
    const result = detector.detect(input, city());
    assert.equal(result.status, "IGNORED"); assert.equal(result.reason, "OUT_OF_ORDER"); assert.equal(result.consecutiveCount, 0);
  }
});

test("a clear observation resets the episode and a new one needs confirmation again", () => {
  const detector = new SpeedingDetectorStateMachine();
  assert.equal(detector.detect(observation(1, 61), city()).status, "PENDING");
  assert.equal(detector.detect(observation(2, 60), city()).status, "CLEAR");
  assert.equal(detector.detect(observation(3, 61), city()).status, "PENDING");
  assert.equal(detector.detect(observation(4, 61), city()).status, "CONFIRMED");
});

test("vehicle states are isolated", () => {
  const detector = new SpeedingDetectorStateMachine();
  assert.equal(detector.detect(observation(1, 61, "a"), city()).status, "PENDING");
  assert.equal(detector.detect(observation(1, 61, "b"), city()).status, "PENDING");
  assert.equal(detector.detect(observation(2, 61, "a"), city()).status, "CONFIRMED");
  assert.equal(detector.detect(observation(2, 61, "b"), city()).status, "CONFIRMED");
});

test("duplicate and older timestamps are ignored without changing the stored streak", () => {
  const detector = new SpeedingDetectorStateMachine();
  assert.equal(detector.detect(observation(2, 61), city()).status, "PENDING");
  for (const input of [observation(2, 61), observation(1, 61)]) {
    const result = detector.detect(input, city());
    assert.equal(result.status, "IGNORED"); assert.equal(result.reason, "OUT_OF_ORDER"); assert.equal(result.consecutiveCount, 1);
  }
  assert.equal(detector.detect(observation(3, 61), city()).status, "CONFIRMED");
});

test("invalid observations never mutate the existing state", () => {
  const detector = new SpeedingDetectorStateMachine();
  assert.equal(detector.detect(observation(1, 61), city()).status, "PENDING");
  const invalid = [observation(2, Number.NaN), observation(2, Number.POSITIVE_INFINITY), observation(2, -1), observation(2, 61, "vehicle-a", { latitude: 91 }), observation(2, 61, "vehicle-a", { longitude: 181 }), observation(2, 61, "vehicle-a", { observedAt: "invalid" }), observation(2, 61, " ")];
  for (const input of invalid) {
    const result = detector.detect(input, city());
    assert.equal(result.status, "IGNORED"); assert.equal(result.reason, "INVALID_OBSERVATION");
  }
  assert.equal(detector.detect(observation(2, 61), city()).status, "CONFIRMED");
});

test("disabling the rule clears a pending episode", () => {
  const detector = new SpeedingDetectorStateMachine();
  assert.equal(detector.detect(observation(1, 61), city()).status, "PENDING");
  const disabled = detector.detect(observation(2, 61), city({ ruleEnabled: false }));
  assert.equal(disabled.status, "IGNORED"); assert.equal(disabled.reason, "RULE_DISABLED");
  assert.equal(detector.detect(observation(3, 61), city()).status, "PENDING");
});

test("zone and threshold changes start a new context streak", () => {
  const detector = new SpeedingDetectorStateMachine();
  assert.equal(detector.detect(observation(1, 61), city()).status, "PENDING");
  const zoneChanged = detector.detect(observation(2, 101), outside());
  assert.equal(zoneChanged.status, "PENDING"); assert.equal(zoneChanged.consecutiveCount, 1); assert.equal(zoneChanged.reason, "RULE_CONTEXT_CHANGED");
  const settingsChanged = detector.detect(observation(3, 111), outside({ thresholdKph: 110 }));
  assert.equal(settingsChanged.status, "PENDING"); assert.equal(settingsChanged.consecutiveCount, 1); assert.equal(settingsChanged.reason, "RULE_CONTEXT_CHANGED");
});

test("settings fingerprint changes restart a pending or active streak even when scalar context is unchanged", () => {
  const detector = new SpeedingDetectorStateMachine();
  assert.equal(detector.detect(observation(1, 70), city()).status, "PENDING");
  const pendingRestart = detector.detect(observation(2, 70), city({ settingsFingerprint: "settings-b" }));
  assert.equal(pendingRestart.status, "PENDING"); assert.equal(pendingRestart.consecutiveCount, 1); assert.equal(pendingRestart.reason, "RULE_CONTEXT_CHANGED");
  assert.equal(detector.detect(observation(3, 70), city({ settingsFingerprint: "settings-b" })).status, "CONFIRMED");
  const activeRestart = detector.detect(observation(4, 70), city({ settingsFingerprint: "settings-c" }));
  assert.equal(activeRestart.status, "PENDING"); assert.equal(activeRestart.newlyConfirmed, false);
});

test("CLEAR is not speeding evidence and removes the checkpoint streak identity", () => {
  const detector = new SpeedingDetectorStateMachine();
  detector.detect(observation(1, 70), city()); detector.detect(observation(2, 70), city()); detector.detect(observation(3, 75), city());
  const clear = detector.detect(observation(4, 60), city());
  assert.equal(clear.status, "CLEAR"); assert.equal(clear.speedingPosition, undefined); assert.equal(clear.confirmationObservedAt, undefined);
  const checkpoint = detector.checkpoint("vehicle-a");
  assert.equal(checkpoint?.confirmed, false); assert.equal(checkpoint?.streakStart, null); assert.equal(checkpoint?.confirmationObservedAt, null);
});

test("durable checkpoint hydration preserves pending start and confirmed receipt identity across restart", () => {
  const pending = new SpeedingDetectorStateMachine();
  pending.detect(observation(1, 70, "vehicle-a", { latitude: 49.21, longitude: 28.41 }), city({ confirmationRequired: 3 }));
  const pendingCheckpoint = pending.checkpoint("vehicle-a"); assert.ok(pendingCheckpoint);
  const pendingRestart = new SpeedingDetectorStateMachine(); pendingRestart.hydrate(pendingCheckpoint);
  assert.equal(pendingRestart.detect(observation(2, 70), city({ confirmationRequired: 3 })).status, "PENDING");
  const confirmed = pendingRestart.detect(observation(3, 70), city({ confirmationRequired: 3 }));
  assert.equal(confirmed.status, "CONFIRMED"); assert.deepEqual(confirmed.streakStart, { observedAt: "2026-08-06T10:00:01.000Z", latitude: 49.21, longitude: 28.41 });

  const activeRestart = new SpeedingDetectorStateMachine(); activeRestart.hydrate(pendingRestart.checkpoint("vehicle-a")!);
  const active = activeRestart.detect(observation(4, 75), city({ confirmationRequired: 3 }));
  assert.equal(active.status, "ACTIVE"); assert.equal(active.confirmationObservedAt, confirmed.observedAt);
});

test("confirmation counts one and three obey their configured values", () => {
  const one = new SpeedingDetectorStateMachine();
  const immediate = one.detect(observation(1, 61), city({ confirmationRequired: 1 }));
  assert.equal(immediate.status, "CONFIRMED"); assert.equal(immediate.newlyConfirmed, true);
  assert.equal(one.detect(observation(2, 61), city({ confirmationRequired: 1 })).status, "ACTIVE");
  const three = new SpeedingDetectorStateMachine();
  assert.equal(three.detect(observation(1, 61), city({ confirmationRequired: 3 })).status, "PENDING");
  assert.equal(three.detect(observation(2, 61), city({ confirmationRequired: 3 })).status, "PENDING");
  assert.equal(three.detect(observation(3, 61), city({ confirmationRequired: 3 })).status, "CONFIRMED");
});

test("resetVehicle and clearAll remove only the requested in-memory states", () => {
  const detector = new SpeedingDetectorStateMachine();
  detector.detect(observation(1, 61, "a"), city()); detector.detect(observation(1, 61, "b"), city());
  assert.equal(detector.stateCount(), 2); detector.resetVehicle("a"); assert.equal(detector.stateCount(), 1);
  assert.equal(detector.detect(observation(2, 61, "a"), city()).status, "PENDING");
  detector.clearAll(); assert.equal(detector.stateCount(), 0);
});
