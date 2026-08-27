import assert from "node:assert/strict";
import test from "node:test";
import { TripStopAnalyticsTargetError, TripStopAnalyticsVehicleNotFoundError } from "./trip-stop-analytics.errors";
import { TripStopAnalyticsService } from "./trip-stop-analytics.service";
import type { TripStopAnalyticsObservation, TripStopAnalyticsRepository } from "./trip-stop-analytics.types";
import { DEFAULT_TRIP_STOP_ANALYTICS_POLICY } from "./trip-stop-analytics.constants";

const vehicle = Object.freeze({ id: "00000000-0000-4000-8000-000000000001", name: "Local vehicle" });
const from = new Date("2026-08-01T00:00:00Z");
const to = new Date("2026-08-08T00:00:00Z");

function service(snapshot: Awaited<ReturnType<TripStopAnalyticsRepository["getSnapshot"]>>): TripStopAnalyticsService {
  return new TripStopAnalyticsService({ getSnapshot: async () => snapshot }, { getSnapshot: async () => DEFAULT_TRIP_STOP_ANALYTICS_POLICY } as any);
}

test("known vehicle with zero observations returns a successful empty analysis", async () => {
  const result = await service({ vehicle, observations: [] }).analyze(vehicle.id, { from, to });
  assert.deepEqual(result.vehicle, vehicle);
  assert.deepEqual(result.summary, { rawObservationCount: 0, continuitySegmentCount: 0, tripCount: 0, stopCount: 0, gapCount: 0, totalObservedTripDistanceMeters: 0, firstObservationAt: null, lastObservationAt: null });
});

test("unknown vehicle produces the explicit analytics not-found error", async () => {
  await assert.rejects(service({ vehicle: null, observations: [] }).analyze(vehicle.id, { from, to }), TripStopAnalyticsVehicleNotFoundError);
});

test("invalid and over-seven-day targets are rejected before repository access", async () => {
  let reads = 0;
  const analytics = new TripStopAnalyticsService({ getSnapshot: async () => { reads += 1; return { vehicle, observations: [] }; } }, { getSnapshot: async () => DEFAULT_TRIP_STOP_ANALYTICS_POLICY } as any);
  await assert.rejects(analytics.analyze(vehicle.id, { from, to: from }), TripStopAnalyticsTargetError);
  await assert.rejects(analytics.analyze(vehicle.id, { from, to: new Date(to.getTime() + 1) }), TripStopAnalyticsTargetError);
  assert.equal(reads, 0);
  await analytics.analyze(vehicle.id, { from, to });
  assert.equal(reads, 1);
});

test("service exposes derived summary and never asks the repository for provider data", async () => {
  const observations: TripStopAnalyticsObservation[] = [
    { observedAt: from, fixFingerprint: "a", latitude: 49, longitude: 28, speedKph: 10, valid: false, outdated: true },
    { observedAt: new Date(from.getTime() + 60_000), fixFingerprint: "b", latitude: 49.001, longitude: 28.001, speedKph: 10, valid: true, outdated: false },
  ];
  let received: unknown;
  const analytics = new TripStopAnalyticsService({ getSnapshot: async (vehicleId, range) => { received = { vehicleId, range }; return { vehicle, observations }; } }, { getSnapshot: async () => DEFAULT_TRIP_STOP_ANALYTICS_POLICY } as any);
  const result = await analytics.analyze(vehicle.id, { from, to });
  assert.deepEqual(received, { vehicleId: vehicle.id, range: { from, to } });
  assert.equal(result.summary.tripCount, 1);
  assert.equal(result.summary.rawObservationCount, 2);
});

test("one analytics operation resolves one immutable policy snapshot before applying it", async () => {
  let reads = 0; const policy = { ...DEFAULT_TRIP_STOP_ANALYTICS_POLICY, tripMovementSpeedKph: 11 };
  const analytics = new TripStopAnalyticsService({ getSnapshot: async () => ({ vehicle, observations: [{ observedAt: from, fixFingerprint: "a", latitude: 49, longitude: 28, speedKph: 10, valid: true, outdated: false }, { observedAt: new Date(from.getTime() + 60_000), fixFingerprint: "b", latitude: 49, longitude: 28.01, speedKph: 10, valid: true, outdated: false }] }) }, { getSnapshot: async () => { reads += 1; return policy; } } as any);
  const result = await analytics.analyze(vehicle.id, { from, to }); assert.equal(reads, 1); assert.equal(result.summary.tripCount, 0);
});
