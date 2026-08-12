import type { TripAnalysisResponse } from "./trip-analysis-contract";
export const TRIP_ANALYSIS_VEHICLE_ID = "00000000-0000-4000-8000-000000000001";
export function tripAnalysisFixture(): TripAnalysisResponse { return {
  vehicleId: TRIP_ANALYSIS_VEHICLE_ID, from: "2026-08-01T00:00:00.000Z", to: "2026-08-01T12:00:00.000Z",
  summary: { tripCount: 1, stopCount: 1, gapCount: 1, totalObservedDistanceMeters: 1234, rawObservationCount: 7, firstObservationAt: "2026-08-01T00:00:00.000Z", lastObservationAt: "2026-08-01T00:20:00.000Z" },
  trips: [{ startAt: "2026-08-01T00:00:00.000Z", endAt: "2026-08-01T00:01:00.000Z", durationSeconds: 60, observedDistanceMeters: 1234, startPosition: { latitude: 49, longitude: 28, observedAt: "2026-08-01T00:00:00.000Z" }, endPosition: { latitude: 49.01, longitude: 28.01, observedAt: "2026-08-01T00:01:00.000Z" }, observationCount: 2, terminationReason: "RANGE_END", endClipped: true }],
  stops: [{ startAt: "2026-08-01T00:05:00.000Z", endAt: "2026-08-01T00:10:00.000Z", durationSeconds: 300, startPosition: { latitude: 49.02, longitude: 28.02, observedAt: "2026-08-01T00:05:00.000Z" }, endPosition: { latitude: 49.02, longitude: 28.02, observedAt: "2026-08-01T00:10:00.000Z" }, observationCount: 2, terminationReason: "DATA_GAP", endClipped: false }],
  gaps: [{ fromObservedAt: "2026-08-01T00:10:00.000Z", toObservedAt: "2026-08-01T00:20:00.000Z", durationSeconds: 600 }],
}; }

