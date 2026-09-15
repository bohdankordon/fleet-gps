import assert from "node:assert/strict";
import test from "node:test";
import type { InactivityDetectionResult } from "../inactivity-detector";
import type { SpeedingDetectionResult } from "../speeding-detector";
import { mapInactivityDetectionToAlertEventAction, mapSpeedingDetectionToAlertEventAction } from "./alert-events.mapper";

const VEHICLE_ID = "00000000-0000-4000-8000-000000000001";
const OBSERVED_AT = "2026-08-08T10:00:00.000Z";

function speeding(overrides: Partial<SpeedingDetectionResult> = {}): SpeedingDetectionResult {
  return { vehicleId: VEHICLE_ID, observedAt: OBSERVED_AT, status: "CONFIRMED", reason: "ABOVE_THRESHOLD", zone: "CITY", speedKph: 72, thresholdKph: 60, consecutiveCount: 2, confirmationRequired: 2, newlyConfirmed: true, confirmationPosition: { latitude: 49.23, longitude: 28.48 }, ...overrides };
}

function inactivity(overrides: Partial<InactivityDetectionResult> = {}): InactivityDetectionResult {
  return { vehicleId: VEHICLE_ID, observedAt: OBSERVED_AT, status: "CONFIRMED", reason: "INACTIVITY_CONFIRMED", elapsedMinutes: 60, traveledDistanceMeters: 12, distanceThresholdMeters: 300, durationThresholdMinutes: 60, windowPointCount: 3, newlyConfirmed: true, ...overrides };
}

test("speeding CONFIRMED newlyConfirmed maps to a typed OPEN command", () => {
  const action = mapSpeedingDetectionToAlertEventAction(speeding());
  assert.equal(action.kind, "OPEN");
  if (action.kind === "OPEN") assert.deepEqual(action.command, { type: "SPEEDING", vehicleId: VEHICLE_ID, observedAt: new Date(OBSERVED_AT), zone: "CITY", speedKph: 72, speedThresholdKph: 60, confirmationLatitude: 49.23, confirmationLongitude: 28.48 });
});

test("inactivity CONFIRMED newlyConfirmed maps to a typed OPEN command", () => {
  const action = mapInactivityDetectionToAlertEventAction(inactivity());
  assert.equal(action.kind, "OPEN");
  if (action.kind === "OPEN") assert.deepEqual(action.command, { type: "INACTIVITY", vehicleId: VEHICLE_ID, observedAt: new Date(OBSERVED_AT), traveledDistanceMeters: 12, distanceThresholdMeters: 300, durationThresholdMinutes: 60 });
});

test("PENDING, COLLECTING, and IGNORED produce no persistence action", () => {
  assert.equal(mapSpeedingDetectionToAlertEventAction(speeding({ status: "PENDING", newlyConfirmed: false })).kind, "NONE");
  assert.equal(mapSpeedingDetectionToAlertEventAction(speeding({ status: "IGNORED", newlyConfirmed: false })).kind, "NONE");
  assert.equal(mapInactivityDetectionToAlertEventAction(inactivity({ status: "COLLECTING", newlyConfirmed: false })).kind, "NONE");
  assert.equal(mapInactivityDetectionToAlertEventAction(inactivity({ status: "IGNORED", newlyConfirmed: false })).kind, "NONE");
});

test("ACTIVE maps only to UPDATE and CLEAR maps only to RESOLVE", () => {
  assert.equal(mapSpeedingDetectionToAlertEventAction(speeding({ status: "ACTIVE", newlyConfirmed: false })).kind, "UPDATE");
  assert.equal(mapInactivityDetectionToAlertEventAction(inactivity({ status: "ACTIVE", newlyConfirmed: false })).kind, "UPDATE");
  assert.equal(mapSpeedingDetectionToAlertEventAction(speeding({ status: "CLEAR", newlyConfirmed: false })).kind, "RESOLVE");
  assert.equal(mapInactivityDetectionToAlertEventAction(inactivity({ status: "CLEAR", newlyConfirmed: false })).kind, "RESOLVE");
});

test("CONFIRMED without newlyConfirmed never opens an event", () => {
  assert.equal(mapSpeedingDetectionToAlertEventAction(speeding({ newlyConfirmed: false })).kind, "NONE");
  assert.equal(mapInactivityDetectionToAlertEventAction(inactivity({ newlyConfirmed: false })).kind, "NONE");
});
