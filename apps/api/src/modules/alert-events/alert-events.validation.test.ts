import assert from "node:assert/strict";
import test from "node:test";
import { createAlertEventActiveKey, createAlertEventDedupeKey } from "./alert-events.keys";
import type { OpenAlertEventCommand } from "./alert-events.types";
import { AlertEventValidationError, validateOpenAlertEventCommand, validateUpdateAlertEventCommand } from "./alert-events.validation";

const VEHICLE_ID = "00000000-0000-4000-8000-000000000001";
const AT = new Date("2026-08-08T10:00:00.000Z");

test("rejects a SPEEDING command carrying inactivity payload", () => {
  const invalid = { type: "SPEEDING", vehicleId: VEHICLE_ID, observedAt: AT, zone: "CITY", speedKph: 70, speedThresholdKph: 60, traveledDistanceMeters: 1 } as unknown as OpenAlertEventCommand;
  assert.throws(() => validateOpenAlertEventCommand(invalid), AlertEventValidationError);
});

test("rejects an INACTIVITY command carrying speeding payload", () => {
  const invalid = { type: "INACTIVITY", vehicleId: VEHICLE_ID, observedAt: AT, traveledDistanceMeters: 1, distanceThresholdMeters: 300, durationThresholdMinutes: 60, speedKph: 70 } as unknown as OpenAlertEventCommand;
  assert.throws(() => validateOpenAlertEventCommand(invalid), AlertEventValidationError);
});

test("rejects UNKNOWN for a SPEEDING event", () => {
  const invalid = { type: "SPEEDING", vehicleId: VEHICLE_ID, observedAt: AT, zone: "UNKNOWN", speedKph: 70, speedThresholdKph: 60 } as unknown as OpenAlertEventCommand;
  assert.throws(() => validateOpenAlertEventCommand(invalid), AlertEventValidationError);
});

test("rejects invalid and non-finite metrics", () => {
  for (const speedKph of [Number.NaN, Number.POSITIVE_INFINITY, -1]) assert.throws(() => validateUpdateAlertEventCommand({ type: "SPEEDING", vehicleId: VEHICLE_ID, observedAt: AT, speedKph }), AlertEventValidationError);
  for (const traveledDistanceMeters of [Number.NaN, Number.NEGATIVE_INFINITY, -1]) assert.throws(() => validateUpdateAlertEventCommand({ type: "INACTIVITY", vehicleId: VEHICLE_ID, observedAt: AT, traveledDistanceMeters }), AlertEventValidationError);
  assert.throws(() => validateOpenAlertEventCommand({ type: "INACTIVITY", vehicleId: VEHICLE_ID, observedAt: AT, traveledDistanceMeters: 1, distanceThresholdMeters: 0, durationThresholdMinutes: 60 }), AlertEventValidationError);
  assert.throws(() => validateOpenAlertEventCommand({ type: "INACTIVITY", vehicleId: VEHICLE_ID, observedAt: AT, traveledDistanceMeters: 1, distanceThresholdMeters: 300, durationThresholdMinutes: 1.5 }), AlertEventValidationError);
});

test("rejects SPEEDING confirmation at or below its threshold", () => {
  for (const speedKph of [60, 59]) assert.throws(() => validateOpenAlertEventCommand({ type: "SPEEDING", vehicleId: VEHICLE_ID, observedAt: AT, zone: "CITY", speedKph, speedThresholdKph: 60 }), AlertEventValidationError);
  assert.equal(validateOpenAlertEventCommand({ type: "SPEEDING", vehicleId: VEHICLE_ID, observedAt: AT, zone: "CITY", speedKph: 60.001, speedThresholdKph: 60 }).type, "SPEEDING");
});

test("rejects INACTIVITY confirmation at or above its distance threshold", () => {
  for (const traveledDistanceMeters of [300, 301]) assert.throws(() => validateOpenAlertEventCommand({ type: "INACTIVITY", vehicleId: VEHICLE_ID, observedAt: AT, traveledDistanceMeters, distanceThresholdMeters: 300, durationThresholdMinutes: 60 }), AlertEventValidationError);
  assert.equal(validateOpenAlertEventCommand({ type: "INACTIVITY", vehicleId: VEHICLE_ID, observedAt: AT, traveledDistanceMeters: 299.999, distanceThresholdMeters: 300, durationThresholdMinutes: 60 }).type, "INACTIVITY");
});

test("dedupe key is deterministic and changes with confirmation identity", () => {
  const first = createAlertEventDedupeKey("SPEEDING", VEHICLE_ID, AT);
  assert.equal(first, createAlertEventDedupeKey("SPEEDING", VEHICLE_ID, new Date(AT)));
  assert.notEqual(first, createAlertEventDedupeKey("INACTIVITY", VEHICLE_ID, AT));
  assert.notEqual(first, createAlertEventDedupeKey("SPEEDING", VEHICLE_ID, new Date(AT.getTime() + 1)));
  assert.match(first, /^[0-9a-f]{64}$/);
});

test("active key is deterministic per vehicle and event type", () => {
  const first = createAlertEventActiveKey("SPEEDING", VEHICLE_ID);
  assert.equal(first, createAlertEventActiveKey("SPEEDING", VEHICLE_ID));
  assert.notEqual(first, createAlertEventActiveKey("INACTIVITY", VEHICLE_ID));
  assert.match(first, /^[0-9a-f]{64}$/);
});
